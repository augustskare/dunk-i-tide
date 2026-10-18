import { array, number, object, string } from "zod";

// Public client identifier and API contract documented by:
// https://github.com/mampfes/hacs_waste_collection_schedule/blob/master/custom_components/waste_collection_schedule/waste_collection_schedule/source/minrenovasjon_no.py
const appKey = "AE13DEEC-804F-4615-A74E-B4FAC11F0A30";
const api = "https://norkartrenovasjon.azurewebsites.net/proxyserver.ashx?server=https://komteksky.norkart.no/MinRenovasjon.Api/api/";

const fractionsSchema = array(object({ Id: number(), Navn: string() }));
const calendarSchema = array(object({
  FraksjonId: number(),
  Tommedatoer: array(string()),
}));

export type CollectionAddress = {
  streetName: string;
  streetCode: string;
  houseNumber: string;
  munNumber: string;
};

function calendarDate(value: string): Date {
  // These are local collection dates, not instants to convert between zones.
  const match = /^(\d{4})-(\d{2})-(\d{2})(?:T.*)?$/.exec(value);
  if (!match) throw new Error("Invalid collection date from Min Renovasjon");
  const [, y, m, d] = match;
  const date = new Date(Number(y), Number(m) - 1, Number(d));
  if (date.getFullYear() !== Number(y) || date.getMonth() !== Number(m) - 1 ||
    date.getDate() !== Number(d)) {
    throw new Error("Invalid collection date from Min Renovasjon");
  }
  return date;
}

export async function getNorkartEvents(address: CollectionAddress) {
  const headers = {
    Kommunenr: address.munNumber,
    RenovasjonAppKey: appKey,
  };
  const query = new URLSearchParams({
    kommunenr: address.munNumber,
    gatenavn: address.streetName,
    gatekode: address.streetCode,
    husnr: address.houseNumber,
  });
  async function request(endpoint: string) {
    const response = await fetch(api + endpoint, {
      headers,
      signal: AbortSignal.timeout(20_000),
    });
    if (!response.ok) {
      throw new Error(`Min Renovasjon request failed for municipality ${address.munNumber} (HTTP ${response.status}); coverage could not be confirmed`);
    }
    return response.json();
  }
  const [fractions, calendar] = await Promise.all([
    request("fraksjoner").then((data) => fractionsSchema.parse(data)),
    request(`tommekalender?${query}`).then((data) => calendarSchema.parse(data)),
  ]);
  const names = new Map(fractions.map(({ Id, Navn }) => [Id, Navn]));
  const events = calendar.flatMap(({ FraksjonId, Tommedatoer }) =>
    Tommedatoer.map((value) => ({
      date: calendarDate(value),
      fraction: FraksjonId,
      title: names.get(FraksjonId) ?? `Avfall ${FraksjonId}`,
    }))
  );
  if (events.length === 0) {
    throw new Error("No collection dates found for this address in Min Renovasjon");
  }
  return events;
}
