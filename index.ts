import { createEvents, type DateTime } from "ics";
import { addressLookup } from "./address.ts";
import { getNorkartEvents } from "./norkart.ts";
import indexHtml from "./index.html";
import coverageHtml from "./coverage.html";
import coverageReport from "./docs/coverage.json";

export default {
  async fetch(req) {
    try {
      const url = new URL(req.url);
      if (url.pathname === "/coverage.json") return Response.json(coverageReport);
      if (url.pathname === "/coverage") {
        return new Response(coverageHtml, {
          headers: { "Content-Type": "text/html; charset=utf-8" },
        });
      }
      if ((url.pathname === "/" || url.pathname === "/index.html") && !url.searchParams.has("q")) {
        return new Response(indexHtml, {
          headers: { "Content-Type": "text/html; charset=utf-8" },
        });
      }
      const query = url.searchParams.get("q");
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
      const events = await getNorkartEvents(collectionAddress);

      const calendarEvents = createEvents(
        events.map(({ date, fraction, title }) => {
          const calDate = [
            date.getFullYear(),
            date.getMonth() + 1,
            date.getDate(),
          ] as DateTime;

          // RFC 5545: an all-day event's end is exclusive and later than start.
          const nextDay = new Date(date.getFullYear(), date.getMonth(), date.getDate() + 1);
          return {
            calName: "Tømmekalender",
            uid: `${address.kommunenummer}-${address.adressekode}-${address.nummer}${address.bokstav ?? ""}-${fraction}-${date.getTime()}@tommekalender.no`,
            title,
            start: calDate,
            end: [nextDay.getFullYear(), nextDay.getMonth() + 1, nextDay.getDate()] as DateTime,
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
