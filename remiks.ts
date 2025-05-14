import { DOMParser } from "jsr:@b-fuze/deno-dom";
import { object, string } from "npm:zod";
import { parseDate } from "./date.ts";

export const fractionIds = new Map([
  [1, "Optisk sortert avfall"],
  [4, "Glass- og metallemballasje"],
]);

export async function getEvents(
  { streetName, streetCode, houseNumber, munNumber }: {
    streetName: string;
    streetCode: string;
    houseNumber: string;
    munNumber: string;
  },
) {
  const htmlDocument =
    await (await fetch("https://remiks.no/privat/tommekalender")).text();
  const parser = new DOMParser();
  const dom = parser.parseFromString(htmlDocument, "text/html");
  const json = dom.querySelector('script[type="application/json"]');

  if (!json) {
    throw new Error("JSON script tag not found");
  }

  const { ajaxUrl: url, nonce: security } = object({
    state: object({
      "min-renovasjon": object({
        ajaxUrl: string(),
        nonce: string(),
      }),
    }),
  }).parse(JSON.parse(json.innerHTML)).state["min-renovasjon"];

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
