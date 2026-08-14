import { object, string } from "zod";
import { parseDate } from "./date.ts";

export const fractionIds = new Map([
  [1, "Optisk sortert avfall"],
  [4, "Glass- og metallemballasje"],
]);

const stateSchema = object({
  state: object({
    "min-renovasjon": object({
      ajaxUrl: string(),
      nonce: string(),
    }),
  }),
});

/**
 * The page embeds its WordPress interactivity state in one of several
 * `<script type="application/json">` tags. Parsed with HTMLRewriter, which is
 * built into the Workers runtime, so no HTML parser dependency is needed.
 */
async function getPageState(response: Response) {
  const blocks: string[] = [];
  let buffer = "";

  await new HTMLRewriter()
    .on('script[type="application/json"]', {
      element(element) {
        buffer = "";
        element.onEndTag(() => {
          blocks.push(buffer);
        });
      },
      text(chunk) {
        buffer += chunk.text;
      },
    })
    .transform(response)
    .arrayBuffer();

  for (const block of blocks) {
    let json: unknown;
    try {
      json = JSON.parse(block);
    } catch {
      continue;
    }

    const parsed = stateSchema.safeParse(json);
    if (parsed.success) {
      return parsed.data.state["min-renovasjon"];
    }
  }

  throw new Error("JSON script tag not found");
}

export async function getEvents(
  { streetName, streetCode, houseNumber, munNumber }: {
    streetName: string;
    streetCode: string;
    houseNumber: string;
    munNumber: string;
  },
) {
  const { ajaxUrl: url, nonce: security } = await getPageState(
    await fetch("https://remiks.no/privat/tommekalender"),
  );

  const body = new FormData();
  body.append("security", security);
  body.append("action", "min_reno/request");
  body.append("streetName", streetName);
  body.append("streetCode", streetCode);
  body.append("houseNumber", houseNumber);
  body.append("munNumber", munNumber);
  body.append("targetEndpoint", "dates");

  const data = await (await fetch(url, {
    method: "POST",
    body,
  })).json() as {
    success: boolean;
    data: {
      fraksjonId: number;
      tommedatoer: string[];
    }[];
  };

  return data.data.flatMap((item) =>
    item.tommedatoer.map((date) => ({
      fraction: item.fraksjonId,
      date: parseDate(date),
    }))
  );
}

export async function addressLookup(query: string) {
  const url = new URL("https://ws.geonorge.no/adresser/v1/sok");
  url.searchParams.set("sok", query);
  url.searchParams.set("fuzzy", "true");
  url.searchParams.set("kommunenummer", "5501 5534");

  return (await fetch(url)).json() as Promise<{
    adresser: {
      adressenavn: string;
      adressekode: number;
      nummer: number;
      kommunenummer: string;
    }[];
  }>;
}
