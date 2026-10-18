import { createEvents, type DateTime } from "ics";
import { addressLookup, fractionIds, getEvents } from "./remiks.ts";
import { getNorkartEvents } from "./norkart.ts";

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

      const collectionAddress = {
        streetName: address.adressenavn,
        streetCode: address.adressekode.toString(),
        houseNumber: `${address.nummer}${address.bokstav ?? ""}`,
        munNumber: address.kommunenummer,
      };
      const isRemiks = ["5501", "5534"].includes(address.kommunenummer);
      const events = isRemiks
        ? (await getEvents(collectionAddress)).map((event) => ({
          ...event,
          title: fractionIds.get(event.fraction) ?? "Ukjent",
        }))
        : await getNorkartEvents(collectionAddress);

      const calendarEvents = createEvents(
        events.map(({ date, fraction, title }) => {
          const calDate = [
            date.getFullYear(),
            date.getMonth() + 1,
            date.getDate(),
          ] as DateTime;

          return {
            calName: "Tømmekalender",
            uid: `${address.kommunenummer}-${address.adressekode}-${address.nummer}${address.bokstav ?? ""}-${fraction}-${date.getTime()}@tommekalender.no`,
            title,
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
