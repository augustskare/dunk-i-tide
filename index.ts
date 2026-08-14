import { createEvents, type DateTime } from "ics";
import { addressLookup, fractionIds, getEvents } from "./remiks.ts";

export default {
  async fetch(req) {
    try {
      const query = new URL(req.url).searchParams.get("q");
      if (!query) {
        throw new Error("Missing query parameter");
      }

      const address = (await addressLookup(query)).adresser[0];
      if (!address) {
        throw new Error("Address not found");
      }

      const events = await getEvents({
        streetName: address.adressenavn,
        streetCode: address.adressekode.toString(),
        houseNumber: address.nummer.toString(),
        munNumber: address.kommunenummer,
      });

      const calendarEvents = createEvents(
        events.map(({ date, fraction }) => {
          const calDate = [
            date.getFullYear(),
            date.getMonth() + 1,
            date.getDate(),
          ] as DateTime;

          return {
            calName: "Remiks tømmekalender",
            uid: `${date.getTime()}@tommekalender.no`,
            title: fractionIds.get(fraction) ?? "Ukjent",
            start: calDate,
            end: calDate,
          };
        }),
      );

      if (calendarEvents.error) {
        throw new Error(calendarEvents.error.message);
      }

      return new Response(calendarEvents.value, {
        headers: { "Content-Type": "text/plain" },
      });
    } catch (err) {
      let message = "Invalid request";
      if (err instanceof Error) {
        message = err.message;
      }
      return new Response(message, { status: 400 });
    }
  },
} satisfies ExportedHandler;
