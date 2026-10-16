# Demo transcript: Oaxaca trip that saves itself while you play

Generated 2026-10-16T16:48:42.148Z on LOCAL Monad Solonet (chain 20143, http://localhost:8080). Mock USDC, test accounts. Nothing public.

Monad charges the gas **limit**, so every tx is sent with limit = estimate × 1.10; "gas used" below equals the limit charged.

## Outcome

- Trip vault `0xc2762C9cae7C5eCB81d31aCEf5BFcA885981115a`: **64.36% funded (321.81721 / 500 USDC incl. 254 already spent on bookings)**
- Vault balance now 67.81721 USDC; principal 320.5; yield earned 1.31721 USDC (mock pool, 30 simulated days)
- Streak: **13 days** (best 13); 27 proved visits
- $TOURS: Ana 296 earned → 176 after a 150 perk (burned); Luis 40 from backing; supply 226
- Treasury revenue: 84.908 USDC (sponsor fees 74 + booking fees 6.48)
- Check-ins: 27 visits in **12 batched claims** (one per day) + Ana's show ticket scan → streak 13
- Oaxaca show: 5 tickets, gross 60 USDC → Lumbre 40.32, Foro Oaxaca 17.28, fee 2.4; venue deposit released 48.5
- CDMX show: venue cancelled → 80 USDC back to Lumbre's tour fund, 3 tickets (45 USDC) refunded; escrows now tickets 36 / venues 130
- Venue reliability: Oaxaca 1 held / 0 cancelled; CDMX 0 / 1
- Treasury fee breakdown: sponsor 74 + bookings 6.48 + venue deposits 1.5 + tickets 2.928
- Casa Azul cancellation: refunded automatically; Ana's leash allowance for that host back to 38 USDC spent
- 110 transactions, 32,485,167 gas, 3.3135 MON at Solonet's 100 gwei base fee

## Refused by the contracts (simulated, never sent)

| Section | Attempt | By | Revert |
|---|---|---|---|
| 1 | Ana tries to pay Marisol before the trip window opens | Ana (traveler) | `TripNotStarted()` |
| 2 | replay the same signed batch | Ana (traveler) | `VisitReused(0x449ab287dd1932063f31eafe96cc77a9ab7c4a8a59fa0a2362300b8976b2dae3)` |
| 2 | single claim for a stop already claimed in that day's batch | Ana (traveler) | `AlreadyClaimedToday(20741)` |
| 2 | Luis forges his own batch attestation | Luis (friend) | `BadAttestation()` |
| 3 | Ana tries to send $TOURS to Luis (points mode) | Ana (traveler) | `NonTransferable()` |
| 4 | book a hostel whose owner is not on the leash | Ana (traveler) | `NotApprovedVendor(0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC)` |
| 4 | book 4 nights at Casita Jalatlaco (168 > 160 USDC cap) | Ana (traveler) | `VendorCapExceeded(0x9965507D1a55bcC2695C58ba16FB37d819B0A4dc, 168000000, 160000000)` |
| 4 | a check-in proof signed by the global Hunt key no longer releases a host escrow | Marisol (local guide) | `BadAttestation()` |
| 5 | tour fund books a venue that is not on the leash | Lumbre (artist) | `NotApprovedVendor(0x15d34AAf54267DB7D7c367839AAf71A00a2C6A65)` |
| 5 | fans try to buy CDMX tickets before the venue accepts the request | Sofía (fan) | `AwaitingApproval()` |
| 5 | door-scalping lock: after the first scan Sofía tries to pass her spare ticket to Marisol (holds none) | Sofía (fan) | `TransferLocked()` |
| 5 | scan Ana's ticket a second time | Foro Lumbre Oaxaca (venue) | `AlreadyUsed()` |
| 5 | the global Hunt key can no longer attest a show | Foro Lumbre Oaxaca (venue) | `BadAttestation()` |
| 5 | buy a ticket for the cancelled CDMX show | Sofía (fan) | `NotOnSale()` |
| 5b | Luis lists a ticket at 13.21 USDC (cap is 110% of 12 = 13.20) | Luis (friend) | `PriceAboveCap(13210000, 13200000)` |

## 0. Partners set up (sponsored stops, listings, perks)

| # | Action | From | Call | Gas | Tx hash |
|---|---|---|---|---|---|
| 1 | faucet 1,000 mock USDC to Ana (traveler) | Ana (traveler) | `usdc.faucet` | 70,128 | `0x51fc354d2165afdcb2073a463287655eaaaec84554c4cce22dc69bcc872e30cf` |
| 2 | faucet 1,000 mock USDC to Luis (friend) | Luis (friend) | `usdc.faucet` | 70,115 | `0x21199121622cafaab8d3f3fd55ce21755d302d8378aec95895f43ce4729e1367` |
| 3 | faucet 1,000 mock USDC to Marisol (local guide) | Marisol (local guide) | `usdc.faucet` | 70,128 | `0x14f695be03da76f6b4fc34b57b740f4eb66fe4263585fe1d4a814869d18e5e7c` |
| 4 | faucet 1,000 mock USDC to Casita Jalatlaco (host) | Casita Jalatlaco (host) | `usdc.faucet` | 70,128 | `0x43c2f618e00fcefb81a76f1a8bdc158b9b45ebd63fe67e2a22c5d6688b309a8d` |
| 5 | faucet 1,000 mock USDC to Lumbre (artist) | Lumbre (artist) | `usdc.faucet` | 70,128 | `0x3025bd44950d83b53a70b398768eb2a15fd9ede1afb4eecaf73b80b495fcf6c9` |
| 6 | faucet 1,000 mock USDC to Foro Lumbre Oaxaca (venue) | Foro Lumbre Oaxaca (venue) | `usdc.faucet` | 70,115 | `0x7fd7135cbd5af1e7538bcbe46c186fa02cface20650afc69d5183cbeedf18ca8` |
| 7 | faucet 1,000 mock USDC to Foro Indie CDMX (venue) | Foro Indie CDMX (venue) | `usdc.faucet` | 70,128 | `0xb1ae4d2345a04a9f1344d21cc55196ea9625bb9a1a35a4406e0ecc33905f1031` |
| 8 | faucet 1,000 mock USDC to Sofía (fan) | Sofía (fan) | `usdc.faucet` | 70,128 | `0x0230371eb4823f9c8c5a7217dd627673549155cebec90eebb14846cfe7c487c3` |
| 9 | Casita Jalatlaco (host) approves campaign budget | Casita Jalatlaco (host) | `usdc.approve` | 57,311 | `0x80313ab7c0df994cc6017907cc5a0c3b9a4053816f2869bdf37fd483e39b93bd` |
| 10 | Casita Jalatlaco (host) sponsors stop "Hunt cache · Jardín Etnobotánico" (300 USDC, 10% platform fee) | Casita Jalatlaco (host) | `rewards.createCampaign` | 390,120 | `0x06754e78f13313e0fd80b76bff6c4e779624af9d21d393a546d7747c93efaaac` |
| 11 | Marisol (local guide) approves campaign budget | Marisol (local guide) | `usdc.approve` | 57,311 | `0xfa92e9c6c3e564e879807b54cc8e4aa4efbae395b6f14b69194c59aaa4588897` |
| 12 | Marisol (local guide) sponsors stop "Marisol's meeting point · Santo Domingo" (200 USDC, 10% platform fee) | Marisol (local guide) | `rewards.createCampaign` | 314,806 | `0xec5743b0549bcad8c16551f06b09b86fcea1e0ed19845c4f0cf37692dabfa96c` |
| 13 | Lumbre (artist) approves campaign budget | Lumbre (artist) | `usdc.approve` | 57,311 | `0x92040e9d81259c6c0edc8fb634586d597b23d13b2dc9c46fb3e995fd3864a574` |
| 14 | Lumbre (artist) sponsors stop "Lumbre mural · Calle Macedonio Alcalá" (100 USDC, 10% platform fee) | Lumbre (artist) | `rewards.createCampaign` | 314,792 | `0x5e24d853e99750a05345e61b09f1a7111b9041e2ed591f91fb05901dd9bd49df` |
| 15 | Foro Lumbre Oaxaca (venue) approves campaign budget | Foro Lumbre Oaxaca (venue) | `usdc.approve` | 57,311 | `0x107f7c08335b905b511e42f1a2cc674b735589339133bdf46400e3f41963c424` |
| 16 | Foro Lumbre Oaxaca (venue) sponsors stop "Foro Lumbre Oaxaca · patio murals" (80 USDC, 10% platform fee) | Foro Lumbre Oaxaca (venue) | `rewards.createCampaign` | 314,726 | `0xd4b0f326db9a68456f5f126bef696c6f0b63f81852229fc6742c4d6f58ada4e8` |
| 17 | Foro Indie CDMX (venue) approves campaign budget | Foro Indie CDMX (venue) | `usdc.approve` | 57,311 | `0x1ff2e6135578645c997ac0b8d260f3a4901797aeda0910f777f681642eec1b46` |
| 18 | Foro Indie CDMX (venue) sponsors stop "Foro Indie CDMX · Roma mural walk" (60 USDC, 10% platform fee) | Foro Indie CDMX (venue) | `rewards.createCampaign` | 314,726 | `0x3bd04151fa58a8794c4e5cb81c1a2bdb6445a1f6d2e3003fbf6e43ce5ceb3080` |
| 19 | Marisol (local guide) lists "Mezcal & Monte Albán day tour" at 45 USDC | Marisol (local guide) | `bookings.createListing` | 223,485 | `0xb825e7fe9f782011df84799518730cff9d56162840d2ae52a2f6a021378d4b53` |
| 20 | Casa Azul (host) lists "Casa Azul · garden room" at 38 USDC | Casa Azul (host) | `bookings.createListing` | 226,590 | `0xe99e794c77289581225e24ffbb18579fd84c3c2f73e36f4cbf20a4c08712f102` |
| 21 | Casita Jalatlaco (host) lists "Casita Jalatlaco · whole casita" at 42 USDC | Casita Jalatlaco (host) | `bookings.createListing` | 257,778 | `0x902456e74588fe94e4f38f1d8468fa3579c6faac8d223fe7f8c88de8f7f8f206` |
| 22 | Luis (friend) lists "Random hostel (not on the leash)" at 25 USDC | Luis (friend) | `bookings.createListing` | 257,592 | `0xce05638364e9fe19cbe2ea6ccb8d4f570ddf1a1ef637a17407ff16eec4a89656` |
| 23 | Marisol (local guide) lists "Coyoacán & Frida walk" at 35 USDC | Marisol (local guide) | `bookings.createListing` | 207,662 | `0x88b7d713034e1b71226ecf72ea7f7bc3bdbccb1f6c9e94195ac8d66cf8de7574` |
| 24 | Casa Roma (host) lists "Casa Roma · garden loft" at 55 USDC | Casa Roma (host) | `bookings.createListing` | 226,563 | `0xebca370130298549401c174550fd965e4fac1eb50f42f16fc976cfa8ef505e8c` |
| 25 | EmpowerTours approves Marisol as a perk partner | EmpowerTours admin (deployer) | `perks.setPartner` | 66,411 | `0x9ee4c6fd1d26d3784c58fde4c0bdbebeb3855fc5b65f11bec016290f19a0d6af` |
| 26 | Lumbre lists perk "Backstage pass · Lumbre live in Oaxaca" for 150 $TOURS | Lumbre (artist) | `perks.listPerk` | 212,797 | `0xec128819806d9a779489ea7cd2757cd09a497d723516856ea0cf07880a85edf3` |
| 27 | Marisol Tours lists perk "10% off the Mezcal & Monte Albán tour" for 60 $TOURS | Marisol (local guide) | `perks.listPerk` | 194,015 | `0xb5eb4c9c3b0b4df68a13c0dadbeb951fda19e2064f0c44e7ed9a9bc9bfecbd24` |
| 28 | Foro Lumbre Oaxaca (venue) lists venue "Foro Lumbre Oaxaca" (70/30 ticket split, 50 USDC deposit, 20 cancel fee) | Foro Lumbre Oaxaca (venue) | `venues.listVenue` | 246,681 | `0xdb551006403242f9ba4d3a69f96349d982e17c67bfe0d81981b169912b5a9944` |
| 29 | Foro Lumbre Oaxaca opens its calendar (next 14 days) | Foro Lumbre Oaxaca (venue) | `venues.setOpenDates` | 494,477 | `0x8556b63ad124064187316303d9275cee9f7fc0022bf5ad9700944da8d6ecd796` |
| 30 | Foro Indie CDMX (venue) lists venue "Foro Indie CDMX" (flat fee 80 USDC, 30 cancel fee) | Foro Indie CDMX (venue) | `venues.listVenue` | 249,866 | `0x24ff0de5a0fef5093cae9ddf62ff3c6c0ff9bbb553644ac799820c47cc039e43` |
| 31 | Foro Indie CDMX opens its calendar (next 14 days) | Foro Indie CDMX (venue) | `venues.setOpenDates` | 494,490 | `0xfc04b13d77f20a86835daa924b8152cb038895111f39ce02b05afdf359c8ed7a` |
| 32 | Casa Azul (host) lists venue "Bar La Cantina (not on the leash)" (80/20) | Casa Azul (host) | `venues.listVenue` | 300,510 | `0x5f56674cded632f3108c8e263b3c398614371f3d5bcf45b8dddca0c7cb79c329` |
| 33 | Bar La Cantina (not on the leash) opens its calendar (next 14 days) | Casa Azul (host) | `venues.setOpenDates` | 494,490 | `0x0b238589781085ed58c330e73d87ac067ab08c10c2aa3be58d06c046b9fc04b7` |
| 34 | Foro Lumbre Oaxaca registers its door-scanner key | Foro Lumbre Oaxaca (venue) | `venues.setScanner` | 77,103 | `0x89438b11e4163fcd0c1c84794aeb1d7574b4bc8fa66b68e8f91e190671edfd1a` |
| 35 | Foro Indie CDMX registers its door-scanner key | Foro Indie CDMX (venue) | `venues.setScanner` | 77,116 | `0x15839dc84050d823382dc0c2b71a28a2810e0045168c38347a6f3f3f7aacbc52` |
| 36 | Foro Indie CDMX turns on manual approval (bookings arrive as requests) | Foro Indie CDMX (venue) | `venues.setManualApproval` | 76,243 | `0xb83bbd79cfd40b5af65aa50183281dedd6739a39157305619557b4ffd4ab9892` |
| 37 | Marisol (local guide) registers its own phone as check-in scanner | Marisol (local guide) | `bookings.setScanner` | 58,122 | `0x8313e98fd6f347e82f58d6b2cdb66b45e0557613e57980d683a1e0d4e9a1291e` |
| 38 | Casa Azul (host) registers its own phone as check-in scanner | Casa Azul (host) | `bookings.setScanner` | 58,122 | `0x04dc714ff969344aeef7166b1a710abf687a406bc9cc0fcee6895da59b7b4903` |
| 39 | Casita Jalatlaco (host) registers its own phone as check-in scanner | Casita Jalatlaco (host) | `bookings.setScanner` | 58,122 | `0xae2d1b86d3792688149867407e633292f53bf5e3f1745a88c278fea200b5ef96` |
| 40 | Casa Roma (host) registers its own phone as check-in scanner | Casa Roma (host) | `bookings.setScanner` | 58,122 | `0x302d9ebad523f1148ce1b54cc68350ceeca05dd8d4bf9bb2a6a3c8d1ffcc6de0` |

## 1. Ana opens an Oaxaca trip vault with a leash; Luis chips in

| # | Action | From | Call | Gas | Tx hash |
|---|---|---|---|---|---|
| 41 | Ana creates trip "Oaxaca, MX · March 2027", goal 500 USDC, leash: 3 vendors, total cap 450 | Ana (traveler) | `factory.createVault` | 756,407 | `0x106f9de0bcfaa48bd7e8e02474545488accba15612fc94ac742571ee0d1fcfff` |
| 42 | Ana approves 200 USDC | Ana (traveler) | `usdc.approve` | 57,311 | `0xdefe0889560233718918f062dd1263e27b25d9f22a98116a7d5509f947fb0b60` |
| 43 | Ana saves 200 USDC (auto-supplied to the lending pool) | Ana (traveler) | `TripVault.deposit` | 477,243 | `0x41dba4165bc0a2949749a2f083152dd6ed452b21df615ace440949b30549bf60` |
| 44 | Luis approves 100 USDC | Luis (friend) | `usdc.approve` | 57,311 | `0xffab04a6be7b3d52153ad0511e4aea28464abdf85dcfb0696b708751ddb8be91` |
| 45 | Luis chips in 100 USDC to Ana's trip | Luis (friend) | `TripVault.deposit` | 382,245 | `0xc4f89fab5e65b54d0fa519684aca2de0a53dd4fad4510aedf2a59b595d7f71ef` |

## 2. Twelve days of proved visits (Hunt GPS attestation) → rewards straight into the trip

| # | Action | From | Call | Gas | Tx hash |
|---|---|---|---|---|---|
| 46 | day 1: 2 visits (Hunt cache, Marisol's meeting point) in ONE batched claim (Ana submits it and pays her own gas) | Ana (traveler) | `rewards.claimBatch` | 689,201 | `0x9d752e6238fc1dbe17f20d82d3806e86f4b4f3cbb593bdbaae18f7a31fa968df` |
| 47 | day 2: 2 visits (Hunt cache, Marisol's meeting point) in ONE batched claim (Ana submits it and pays her own gas) | Ana (traveler) | `rewards.claimBatch` | 576,816 | `0x8823846e281ff0da9bf454c329bcfb2a87c03342c8dfa1de028e26605d4a43f3` |
| 48 | day 3: 2 visits (Hunt cache, Lumbre mural) in ONE batched claim (Ana submits it and pays her own gas) | Ana (traveler) | `rewards.claimBatch` | 592,561 | `0x77a9f13dcdb06fb8d40962f2026891697fb54f1ca10e4dd037a75ea10de2236b` |
| 49 | day 4: 3 visits (Hunt cache, Marisol's meeting point, Foro Lumbre Oaxaca) in ONE batched claim (Ana submits it and pays her own gas) | Ana (traveler) | `rewards.claimBatch` | 648,264 | `0xa39bab311b59cf9679fb43f9884b25991719a3d0c8fada8a110be3155cd8d487` |
| 50 | day 5: 2 visits (Hunt cache, Marisol's meeting point) in ONE batched claim (Ana submits it and pays her own gas) | Ana (traveler) | `rewards.claimBatch` | 576,816 | `0xaf6e006cd23ed494ea2362055576769ee790574a83b54819453481b450ae865e` |
| 51 | day 6: 2 visits (Hunt cache, Lumbre mural) in ONE batched claim (Ana submits it and pays her own gas) | Ana (traveler) | `rewards.claimBatch` | 573,699 | `0xc1feb83bc1c646196d868dae25c62fea071686d71ccccc6f1bfbdc1283638e21` |
| 52 | day 7: 2 visits (Hunt cache, Marisol's meeting point) in ONE batched claim (Ana submits it and pays her own gas) | Ana (traveler) | `rewards.claimBatch` | 614,513 | `0xaec0a36539d2055365cdcb7a5bafb0c7a58b660ca9a36c245d17ec03f26dd93d` |
| 53 | day 8: 3 visits (Hunt cache, Marisol's meeting point, Foro Lumbre Oaxaca) in ONE batched claim (Ana submits it and pays her own gas) | Ana (traveler) | `rewards.claimBatch` | 645,159 | `0xb00951fd0b656551035d431312afa9d0864bd38cd98dc1058d344bc533721099` |
| 54 | day 9: 2 visits (Hunt cache, Lumbre mural) in ONE batched claim (Ana submits it and pays her own gas) | Ana (traveler) | `rewards.claimBatch` | 595,665 | `0xff8e536e0be4d9502771bf9b42033859a75f6b80bd847a246a99b26d67038c59` |
| 55 | day 10: 2 visits (Hunt cache, Marisol's meeting point) in ONE batched claim (Ana submits it and pays her own gas) | Ana (traveler) | `rewards.claimBatch` | 573,686 | `0x5284758720961443fff2bba3b8db6663ce89e96fb121db364f66aacfa192bb29` |
| 56 | day 11: 2 visits (Hunt cache, Marisol's meeting point) in ONE batched claim (Ana submits it and pays her own gas) | Ana (traveler) | `rewards.claimBatch` | 573,699 | `0xcc3bb81793186b5ed515a6e58c78563890e2d904faf004b248e02875262a98dc` |
| 57 | day 12: 3 visits (Hunt cache, Lumbre mural, Foro Lumbre Oaxaca) in ONE batched claim (Ana submits it and pays her own gas) | Ana (traveler) | `rewards.claimBatch` | 626,311 | `0x0b63372d5ce7f89896daf5b26da1e6755ad96669086cec82cdfade46acf18a64` |

## 3. Yield accrues; Ana and Luis back an artist; Ana redeems a perk with $TOURS

| # | Action | From | Call | Gas | Tx hash |
|---|---|---|---|---|---|
| 58 | DEMO ONLY: mock lending pool simulates 30 days of 5% APR (Solonet cannot warp time) | EmpowerTours admin (deployer) | `pool.fastForward` | 60,678 | `0x72e076b83d76879183d0476c8e9963ac8f1e8649d520ca2420b40584b663211b` |
| 59 | Lumbre opens a fan-backed tour fund (leash: Foro Oaxaca ≤100, Foro CDMX ≤150) | Lumbre (artist) | `factory.createVault` | 652,933 | `0x7a75fab715bb3ff1aed5707b87d9a9148289f08fd973958563bae6dfa8069305` |
| 60 | Lumbre approves 200 USDC | Lumbre (artist) | `usdc.approve` | 57,311 | `0xa9d81fe5fcaf1691ad9029b35cb317b3235493fe9c16bee395c3d93631dc16de` |
| 61 | Lumbre puts 200 USDC of her own into the tour fund | Lumbre (artist) | `TripVault(artist).deposit` | 458,246 | `0xe549cad717cfaf7cd1e6d346185403818d04c224d112536dda24ee79bd9e641c` |
| 62 | Luis approves 40 USDC | Luis (friend) | `usdc.approve` | 57,311 | `0xe054f2e96b8efb386185e23afdc8e2ebf0407b23ff96d540dc8e679a6ea3c33a` |
| 63 | Luis backs Lumbre's tour with 40 USDC (perks, not a revenue share) | Luis (friend) | `TripVault(artist).deposit` | 382,245 | `0xdc206c4f22d6dbc0f5864c9d34e8e21c3f5b6a437c90aa11c49d18f53aa60d09` |
| 64 | Ana approves 20 USDC | Ana (traveler) | `usdc.approve` | 57,311 | `0x4a911dfa90e12dad57cb26d9913aee9934173ef520e4bf51643a614449f04533` |
| 65 | Ana backs Lumbre's tour with 20 USDC | Ana (traveler) | `TripVault(artist).deposit` | 382,258 | `0x2ce238ef35422a6ce00648cf35953b1b0d7ce774d33d479a922e1e2823e36fd7` |
| 66 | Ana approves PerkMarket for 150 $TOURS | Ana (traveler) | `tours.approve` | 57,388 | `0xdcec99465de1ac3c72b4df6655443f16a7eff1a75a9b2e801c54595a4b055e4f` |
| 67 | Ana redeems "Backstage pass · Lumbre live in Oaxaca" (150 $TOURS burned) | Ana (traveler) | `perks.redeem` | 238,002 | `0x592dafba8b81e8c156f6c5c45209213646d6a061bcfc70e71e21a1e8d19aa45b` |

## 4. Trip window opens: the vault books a guide and a stay through escrow

| # | Action | From | Call | Gas | Tx hash |
|---|---|---|---|---|---|
| 68 | vault books Mezcal & Monte Albán tour for 2 (90 USDC into escrow) | Ana (traveler) | `TripVault.book` | 665,648 | `0xce62c1e3ca955676adb28783c6dee23c8b69cfc820bc6b66861ce111d30e0ba0` |
| 69 | vault books 3 nights at Casa Azul (114 USDC into escrow) | Ana (traveler) | `TripVault.book` | 592,803 | `0x3e11a58b112927ff83f01d8bbf7296e5021b27cac8ee0794cd3254dd8a3a122a` |
| 70 | Casa Azul cancels → automatic full refund to the vault, leash allowance restored | Casa Azul (host) | `bookings.hostCancel` | 433,551 | `0xa496a00b7d4fe747bea6a49383e1d20bfbfd0c95d696e881d05fa85cf4e819d9` |
| 71 | vault re-books 3 nights at Casita Jalatlaco (126 USDC into escrow) | Ana (traveler) | `TripVault.book` | 573,806 | `0xd1fe69a8579b434fd2d7684a8dbc9c876d91d534392fcf5b2e15da6139ff2d05` |
| 72 | Marisol accepts the booking | Marisol (local guide) | `bookings.acceptBooking` | 76,198 | `0x71b3f2d338a240d0ee48b7dfcb25dafedce1af8abb8887b4e9522ae2c2ef427e` |
| 73 | Marisol scans Ana in with her registered scanner → tour escrow released (3% fee to treasury) | Marisol (local guide) | `bookings.confirmWithAttestation` | 496,359 | `0x535fe74d3af9bf5ad1531038474d93a11b05874d14d96eef793995a5c33a7658` |
| 74 | Ana confirms check-in at Casita Jalatlaco → stay escrow released | Ana (traveler) | `TripVault.confirmCheckIn` | 512,883 | `0xbd147d9e7000c3674430c6e0d592016be3fa3f1bb418ac6f475c384b67a0abab` |
| 75 | Ana anchors her tour review (rating 5 + keccak256 of the text) | Ana (traveler) | `bookings.anchorReview` | 135,982 | `0x1d88ab3dd7af260ab93892ff55c7db96d9fd31155c3ba7c6f1e99ec7715ca5ae` |
| 76 | Ana anchors her stay review | Ana (traveler) | `bookings.anchorReview` | 135,995 | `0xb9782dcd1cfd0563c134dfc68256b16286716bd3fee0cf67fb067aebb9c323f3` |

## 5. Lumbre's tour: venue bookings, ticket sales, a show and a cancellation

| # | Action | From | Call | Gas | Tx hash |
|---|---|---|---|---|---|
| 77 | tour fund books Foro Lumbre Oaxaca for tonight (50 USDC deposit into escrow, 70/30 split) | Lumbre (artist) | `TripVault(artist).bookVenue` | 829,302 | `0x30c77dffb384b1829c8de665c58737b542c8df6aa553e6bb75bf11a6d2a61151` |
| 78 | tour fund books Foro Indie CDMX for tomorrow (80 USDC flat fee into escrow) | Lumbre (artist) | `TripVault(artist).bookVenue` | 811,679 | `0x4d69602f67c448cda55932a204f7e14b83a559c1f04a998daaaf37b763b3c3b1` |
| 79 | Foro Indie CDMX accepts Lumbre's booking request → tickets go on sale | Foro Indie CDMX (venue) | `venues.acceptShow` | 57,028 | `0x015081d1c3b25b0fcd7239385e7dbb95974e8a212f1274b1e108c003c425f13b` |
| 80 | Ana (traveler) approves 12 USDC | Ana (traveler) | `usdc.approve` | 57,297 | `0x1ba01fdec54cf991700d685c6f3672f6b3bc5a6ab88e29398e3b104f7c86de61` |
| 81 | Ana buys 1 ticket for Oaxaca (escrow) | Ana (traveler) | `tickets.buy` | 371,223 | `0x2f3f222710919438c62b366c3de7b5e4a7fe2564694b7e3fd398336038212d4b` |
| 82 | Ana (traveler) approves 15 USDC | Ana (traveler) | `usdc.approve` | 57,311 | `0x4d82c99103cf4ffc771eaed2a269ab0581eb99ca9fd1d4449f0545b2e6d15b05` |
| 83 | Ana buys 1 ticket for CDMX (escrow) | Ana (traveler) | `tickets.buy` | 358,611 | `0xb9a0d546b9547af1544de5c77b8033e31f0e231359a2ab2690bbab137d78ce01` |
| 84 | Luis (friend) approves 24 USDC | Luis (friend) | `usdc.approve` | 57,311 | `0xcb8be26a54ddc3eb9c92c2166d47a7046d544cbd951281f9819d0989715ee4a6` |
| 85 | Luis buys 2 tickets for Oaxaca | Luis (friend) | `tickets.buy` | 418,190 | `0x36f049a2d97e766631d1f02ec61044d28498200cfe288a015757d6016509f683` |
| 86 | Sofía (fan) approves 24 USDC | Sofía (fan) | `usdc.approve` | 57,311 | `0x5da6e346638b48a27caac53101045d6c74d4fb2fa84d8e464e2af6effc5a9da3` |
| 87 | Sofía buys 2 tickets for Oaxaca | Sofía (fan) | `tickets.buy` | 418,190 | `0x6566d434f9e2d4cb7109b419c1b43080e060f782c744799fdac80c735c48f632` |
| 88 | Sofía (fan) approves 30 USDC | Sofía (fan) | `usdc.approve` | 57,324 | `0xe02763ff456fada3066922062940f8051510bbc9118250a45158a1a0bc6974fd` |
| 89 | Sofía buys 2 tickets for CDMX | Sofía (fan) | `tickets.buy` | 399,368 | `0x9c649cccce2f36173fef73556a5634f244aede98523bec03898a8d3a6862ac35` |
| 90 | Luis claims backing $TOURS (unlocked by the share of tour money actually spent) | Luis (friend) | `rewards.claimBacking` | 211,983 | `0xfa2dbe85da72a35df6d8e464919291ff7100dfa5265f01b12ceeeeaa0f0f1b0a` |
| 91 | door scan: Ana (traveler)'s ticket #0 (check-in → $TOURS + streak; venue submits, pays gas) | Foro Lumbre Oaxaca (venue) | `tickets.scan` | 244,622 | `0xb086d2c5b196836b2cd65775e49e438d16830544da0f56b50845e4b9cec08102` |
| 92 | door scan: Luis (friend)'s ticket #2 (check-in → $TOURS + streak; venue submits, pays gas) | Foro Lumbre Oaxaca (venue) | `tickets.scan` | 240,812 | `0x8fd985da387dd4b8fc6507dfdea7bf14ed8cdbdc13b652b7f0267fda8e1dbba6` |
| 93 | door scan: Luis (friend)'s ticket #3 (check-in → $TOURS + streak; venue submits, pays gas) | Foro Lumbre Oaxaca (venue) | `tickets.scan` | 218,893 | `0x6ae27a22d5342e25c0196e359163f867553388d9d1174b1dad12b69f303433a8` |
| 94 | door scan: Sofía (fan)'s ticket #4 (check-in → $TOURS + streak; venue submits, pays gas) | Foro Lumbre Oaxaca (venue) | `tickets.scan` | 259,673 | `0x62a1059bdf4d711ea93789a4112e3f098a396aed40d27f969c95dce391c39681` |
| 95 | Sofía passes her spare ticket to Luis (already a holder → allowed) | Sofía (fan) | `tickets.transferTicket` | 168,942 | `0x128901d07967341c19e977e69cf6d8298f90c3a3e0d6441eb53c85f607743345` |
| 96 | Foro Oaxaca submits its door-QR check-in attestation → show Played, deposit released (3% fee) | Foro Lumbre Oaxaca (venue) | `venues.confirmShow` | 503,257 | `0x21b639a13d8476cc15426b0067733dd9d00b11d86a49d2a6a5c2b57ad35dc6e8` |
| 97 | settle Oaxaca ticket escrow → 4% fee, venue 30%, Lumbre 70% (Lumbre triggers it) | Lumbre (artist) | `tickets.settle` | 213,262 | `0x95064aec6e4abb3fcffb3220909b92bef2ff886d50a9c8cec874a069364fe55b` |
| 98 | Foro Indie CDMX cancels → Lumbre's tour fund refunded automatically (80 USDC), leash restored | Foro Indie CDMX (venue) | `venues.venueCancel` | 480,276 | `0x8b6e4b85889d7f788c426f4053092b6728ae4df474a2a12f084a823e31de6eb3` |
| 99 | refund every CDMX ticket holder in one call (anyone can trigger; the venue does) | Foro Indie CDMX (venue) | `tickets.refundAll` | 194,012 | `0x068bcaa921f52d696a7a23b40ca372a9c298798d51e06caf4871d81b81c08209` |

## 5b. Resale (≤110% of face, artist royalty, EmpowerTours fee), the door lock, and open requests for the UI

| # | Action | From | Call | Gas | Tx hash |
|---|---|---|---|---|---|
| 100 | tour fund books Foro Lumbre Oaxaca again in 3 days (50 USDC deposit) | Lumbre (artist) | `TripVault(artist).bookVenue` | 703,289 | `0x671c4075a6604fb982d68bfd6a8f8877b5b5a40bd232cebe0ec8a8f98ec27d34` |
| 101 | Luis (friend) approves 24 USDC | Luis (friend) | `usdc.approve` | 57,311 | `0x7805c4fb100d59809456c2416607f13e96fb1eb75c779aeca5f76eb1cc8dd9e8` |
| 102 | Luis buys 2 tickets for Oaxaca night 2 | Luis (friend) | `tickets.buy` | 456,201 | `0xfd28615cc47ffe65fd371000e3a8b0785f775344cb78e81275ca51ad818c9342` |
| 103 | Sofía (fan) approves 12 USDC | Sofía (fan) | `usdc.approve` | 57,297 | `0x58c4e57546ca23ceaf2128b3281951b97e1da906ffd831e5e013ba1d0311b76e` |
| 104 | Sofía buys 1 ticket for Oaxaca night 2 | Sofía (fan) | `tickets.buy` | 320,599 | `0x15dc1739c03967e315467dc86844007928a6a333f1c66f0f6f7a1c58ba02a51e` |
| 105 | Luis lists ticket at 13.20 USDC (110% of face) | Luis (friend) | `tickets.listForResale` | 109,661 | `0x5f1afbef1011197b4987ab6911b65e3276a0897fec36915d2b11fe65cd58e701` |
| 106 | Ana approves 13.20 USDC | Ana (traveler) | `usdc.approve` | 57,311 | `0xd3df888096122c4de03fae1e0bb97a36eb4046f74b2c131d41cb691ce7a4cd70` |
| 107 | Ana buys Luis's resale ticket → 4% fee, 5% royalty to Lumbre, rest to Luis | Ana (traveler) | `tickets.buyResale` | 315,718 | `0x920a53ed043db58f1db5f3708718975b7d2f719af7531807c842b0e15ae145f5` |
| 108 | Luis lists his second ticket at 12.60 USDC (left open for the UI) | Luis (friend) | `tickets.listForResale` | 109,661 | `0x82d1e36e2edd50cc8103e39f0830fa95bfd70a570eae2d7099e96b0084d8f87c` |
| 109 | tour fund requests Foro Indie CDMX in 5 days (80 USDC deposit; waits for the venue) | Lumbre (artist) | `TripVault(artist).bookVenue` | 824,550 | `0x41f67f7da2cf771ea5c62d27748f4275dd104d944bfefad4dc982d6d1e3327ec` |
| 110 | vault books 1 night at Casa Azul (38 USDC; left for the host to accept in the UI) | Ana (traveler) | `TripVault.book` | 630,797 | `0x908c143e54ac080e8fd745e7bb96451043a3cf211838e981fb2090087129380a` |

## 6b. In the UI: real transactions from a Mera passkey wallet and DEV test accounts (`demo/ui-flows.mjs` → `demo/ui-flows.json`)

Headless Chromium on http://localhost with the CDP virtual authenticator (PRF extension on), so the Mera passkey ceremony, PRF → key derivation and in-page signing are the real code paths. Gas is from the confirmation toast (= the receipt).

| Step | Result | Gas |
|---|---|---:|
| DEV Foro Indie CDMX: accept Lumbre's booking request | confirmed | 57,028 |
| DEV Casa Azul: accept Ana's booking | confirmed | 76,211 |
| DEV Casa Azul: register this wallet as check-in scanner | skipped | — |
| DEV Casa Azul: scan Ana in → escrow released | confirmed | 496,372 |
| DEV Ana: contribute 25 USDC to the trip vault | confirmed | 271,166 |
| DEV Ana: check in at a stop (local Hunt attester, claimBatch) | confirmed | 520,441 |
| DEV Sofía: buy Luis's resale ticket (fee + royalty + seller) | confirmed | 278,021 |
| [en] 0-MON wallet + signed out: 16 route visits, 0 console errors, 0 tx attempts | confirmed · 0xa94D25130d10c87603ddB4788255be8773780F9A | — |
| [en] 0-MON wallet clicks "Buy a ticket" → top-up sheet (need 0.0534 MON, suggested 0.07 MON); nothing sent | confirmed | — |
| [en] after top-up, auto-continued: Approve 12 USDC | confirmed | 57,297 |
| [en] after top-up, auto-continued: Buy a ticket · Lumbre live · Oaxaca (night 2) | confirmed | 339,447 |
| [es] 0-MON wallet + signed out: 16 route visits, 0 console errors, 0 tx attempts | confirmed · 0xbE2d979bd814D72967c965Ef4d42553b1d2582e7 | — |
| [es] 0-MON wallet clicks "Buy a ticket" → top-up sheet (need 0.0534 MON, suggested 0.07 MON); nothing sent | confirmed | — |
| [es] after top-up, auto-continued: Aprobar 12 USDC | confirmed | 57,297 |
| [es] after top-up, auto-continued: Comprar boleto · Lumbre live · Oaxaca (night 2) | confirmed | 339,447 |
| [en] create passkey wallet | confirmed · 0x43c1822f74b71B4AA0c4905F15Ee944768c27Fce | — |
| [en] sign back in (same address) | confirmed · 0x43c1822f74b71B4AA0c4905F15Ee944768c27Fce | — |
| [en] private note sealed with the second PRF secret | confirmed | — |
| [en] passkey wallet: get 1,000 test USDC (?drip=1: DEV drip opted in) | confirmed | 70,128 |
| [en] passkey wallet: buy a ticket for Oaxaca night 2 | confirmed | 339,447 |
| [en] passkey wallet: list the ticket for resale at 110% of face | confirmed | 109,661 |
| [es] create passkey wallet | confirmed · 0xE6BE0a544E2916db2F3628b11EdDE421a7E2bD3A | — |
| [es] sign back in (same address) | confirmed · 0xE6BE0a544E2916db2F3628b11EdDE421a7E2bD3A | — |
| [es] private note sealed with the second PRF secret | confirmed | — |
| [es] passkey wallet: get 1,000 test USDC (?drip=1: DEV drip opted in) | confirmed | 70,128 |
| [es] passkey wallet: buy a ticket for Oaxaca night 2 | confirmed | 339,447 |
| [es] passkey wallet: list the ticket for resale at 110% of face | confirmed | 109,661 |
| DEV Ana: redeem a perk with $TOURS points | confirmed | 228,320 |

### 6c. Zero-MON wallet, no gas sponsorship

A brand-new Mera passkey wallet with **0 MON** (DEV drip off). Every route was visited signed out and signed in; a ticket purchase opened the top-up sheet instead of sending; a Solonet test account then sent the suggested MON and the purchase finished by itself.

| Lang | Route visits | Console errors | Tx attempts while short | Sheet: needed / suggested | Funded | Txs after funding | MON actually spent |
|---|---:|---:|---:|---|---|---|---:|
| en | 16 | 0 | 0 | 0.0534 MON / 0.07 MON | 0.07 MON @ #203587 | 57,297 + 339,447 gas | 0.040468 |
| es | 16 | 0 | 0 | 0.0534 MON / 0.07 MON | 0.07 MON @ #203698 | 57,297 + 339,447 gas | 0.040468 |

"~X MON" hints shown on buttons for the 0-MON wallet: faucet ~0.009 MON · contribute ~0.041 MON · checkin ~0.064 MON · buyTicket ~0.054 MON.
