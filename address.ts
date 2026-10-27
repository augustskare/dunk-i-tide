export async function addressLookup(query: string) {
  const url = new URL("https://ws.geonorge.no/adresser/v1/sok");
  url.searchParams.set("sok", query);
  url.searchParams.set("fuzzy", "true");
  const response = await fetch(url, { signal: AbortSignal.timeout(20_000) });
  if (!response.ok) throw new Error(`Address lookup failed (HTTP ${response.status})`);
  return response.json() as Promise<{
    adresser: {
      adressenavn: string;
      adressekode: number;
      nummer: number;
      bokstav?: string;
      kommunenummer: string;
    }[];
  }>;
}
