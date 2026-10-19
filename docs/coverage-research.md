# Min Renovasjon coverage research

Checked 2026-10-19 against provider and municipal waste-company sources.

## Finding

Min Renovasjon cannot be treated as a universal Norway collection-calendar provider. Official sources identify municipalities that have left it. Passing tests for selected addresses establishes those addresses only; national address search does not establish national collection-calendar coverage.

## Primary evidence

- [Norkart's MinRenovasjon product page](https://www.norkart.no/offentlig/komtek/renovasjon/minrenovasjon) describes collection information, notifications, route updates and municipal dialogue. It does not promise coverage of every Norwegian municipality.
- [RIR's current app guidance](https://www.rir.no/kundeservice/veiledninger/app) explicitly states: “Den gamle appen Min Renovasjon er stengt for våre kommuner, og vil ikke lenger virke.” RIR now provides its own app. Its guidance says calendar lookup and notifications remain available without signing in, so an alternative integration might be possible, but its protocol was not investigated here.
- [RIR's company page](https://www.rir.no/om-oss) identifies its household-waste service area as Aukra, Hustadvika, Gjemnes, Molde and Rauma. Combined with the previous source, this is a concrete counterexample to assuming nationwide Min Renovasjon support.
- [BIR's collection-calendar page](https://bir.no/selvbetjening-og-kontaktskjema/naar-kommer-bossbilen/naar-kommer-bossbilen/) directs customers to the BIR app and its own address lookup. [The app's publisher listing](https://play.google.com/store/apps/details?hl=no&id=com.norconsult.tommeplan.bir) identifies Norconsult Digital AS as its publisher. This suggests a separate integration is needed; the existence of another app alone does not prove that a Norkart endpoint has no data.
- [Trondheim Renholdsverk's calendar](https://trv.no/plan/) says its plan covers every household and housing association in Trondheim and directs customers to “Tømmeplan Trondheim”. This is an official alternative calendar source; live Norkart results are still needed to establish whether duplicate Norkart data exists.

## Municipality-list discovery

[Norkart's hosted demo index](https://norkartrenovasjon.azurewebsites.net/) links an administrator demo labelled “Administrator verktøy med alle kommunene” at [KommuneSider/Baerum.html](https://norkartrenovasjon.azurewebsites.net/KommuneSider/Baerum.html). The wording describes that demo's municipality selector; it is not a promise of nationwide calendar availability.

The first-party [Norkart client URL module](https://norkartrenovasjon.azurewebsites.net/Renovation/URL/URL.js), in `_buildRegisteredCustomerLink`, identifies the provider's registered-customer catalogue:

```text
https://norkartrenovasjon.azurewebsites.net/proxyserver.ashx?server=https://www.webatlas.no/wacloud/servicerepository/CatalogueService.svc/json/GetRegisteredAppCustomers?Appid=MobilOS-NorkartRenovasjon
```

The live coverage audit compared that catalogue with [Kartverket/Geonorge's current municipality list](https://ws.geonorge.no/kommuneinfo/v1/kommuner). On 2026-10-19, 204 of the 357 current municipalities appeared in the provider registry; 153 did not. This is a registry comparison, not a claim that every registered municipality or address yields dates. Historical municipality identifiers also need to be distinguished from current municipality identifiers when interpreting the raw provider catalogue.

Registry absence means this integration cannot confirm provider coverage for that municipality. It does not independently prove that no Norkart calendar exists, since the catalogue could lag a service change or use an older identifier. Conversely, registry presence does not verify that collection dates exist for a particular address. The end-to-end audit must record actual address/calendar outcomes separately.

## Implication for this project

Keep nationwide coverage claims out of the UI and README unless supported by a complete audit and additional provider integrations. Distinguish an unsupported municipality from an address that has no dates and from an upstream outage. Registry membership and nonempty fraction metadata alone do not prove a valid calendar for any particular address.
