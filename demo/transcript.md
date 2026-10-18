# Rumbo by EmpowerTours · demo transcript: an Oaxaca trip that saves itself while you play

Generated 2026-10-18T01:18:23.425Z on LOCAL Monad Solonet (chain 20143, http://localhost:8080). Mock USDC, test accounts. Nothing public.

Monad charges the gas **limit**, so every tx is sent with limit = estimate × 1.10; "gas used" below equals the limit charged.

## Outcome

- Trip vault `0xb406262CE03F4dD507Ca8B67649E7eE1a52Aa047`: **64.36% funded (321.81721 / 500 USDC incl. 254 already spent on bookings)**
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
- 115 transactions, 32,584,742 gas, 3.3236 MON at Solonet's 100 gwei base fee

## Refused by the contracts (simulated, never sent)

| Section | Attempt | By | Revert |
|---|---|---|---|
| 1 | Ana tries to pay Marisol before the trip window opens | Ana (traveler) | `TripNotStarted()` |
| 2 | replay the same signed batch | Ana (traveler) | `VisitReused(0x2338f3db4d540b3c389d22d100963e5474bc6a2330b801091e3efb984c8699e5)` |
| 2 | single claim for a stop already claimed in that day's batch | Ana (traveler) | `AlreadyClaimedToday(20743)` |
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
| 1 | devnet: send 50 MON gas money to Foro Lumbre Oaxaca (venue) | EmpowerTours admin (deployer) | `transfer` | 21,165 | `0xb4e0c9fb7c80ce09d2bd4d93d1af1f564b2ff73be5c538a3f54bdbb4788d85f2` |
| 2 | devnet: send 50 MON gas money to Foro Indie CDMX (venue) | EmpowerTours admin (deployer) | `transfer` | 21,165 | `0xd0c17dcffa38aba8fc964e9b5237860146d136469284fb9a7ab4b51862197724` |
| 3 | devnet: send 50 MON gas money to Sofía (fan) | EmpowerTours admin (deployer) | `transfer` | 21,165 | `0xb9b3844fb10bbe4cf283eca54c77e2f54c07123e809e0c9109dea7e0066872c4` |
| 4 | devnet: send 50 MON gas money to Casa Roma (host) | EmpowerTours admin (deployer) | `transfer` | 21,165 | `0xd96d6f40e45550e781000189934b01d3bfda4905bfdbf67bbc2eba409fd58e30` |
| 5 | devnet: send 500 MON gas money to devnet gas drip (UI, dev builds only) | EmpowerTours admin (deployer) | `transfer` | 21,165 | `0x72517321faf3b48e9b8dacb35531b5d0f16b3c92a6931de3eb54a1ed7ee56af6` |
| 6 | faucet 1,000 mock USDC to Ana (traveler) | Ana (traveler) | `usdc.faucet` | 70,128 | `0x82059fe2803d4000f1b80370941225a6908840245194b98f0987f177d2eb7ed7` |
| 7 | faucet 1,000 mock USDC to Luis (friend) | Luis (friend) | `usdc.faucet` | 70,115 | `0x24ea04e9ede5a58b256f4e1bdc3867272ff7e45e158cddfaa4ed5602543479d5` |
| 8 | faucet 1,000 mock USDC to Marisol (local guide) | Marisol (local guide) | `usdc.faucet` | 70,128 | `0x98431b03097adcb5d38aaa9b0ecbe748a328bead1fadcf5e6b7aa800522ea3a2` |
| 9 | faucet 1,000 mock USDC to Casita Jalatlaco (host) | Casita Jalatlaco (host) | `usdc.faucet` | 70,128 | `0x6567f64349ddb557b4f67cf9f69533f9700790e8414f38770618a1e3e741db90` |
| 10 | faucet 1,000 mock USDC to Lumbre (artist) | Lumbre (artist) | `usdc.faucet` | 70,128 | `0xc0a7105f0916a91d312a2d675a884bbe92722e01b8e303389a9f7b777575b1a5` |
| 11 | faucet 1,000 mock USDC to Foro Lumbre Oaxaca (venue) | Foro Lumbre Oaxaca (venue) | `usdc.faucet` | 70,115 | `0x2c8b2d02b0e82f4acd1da0177819c10807489314e98e9394e17f899e18c21d4c` |
| 12 | faucet 1,000 mock USDC to Foro Indie CDMX (venue) | Foro Indie CDMX (venue) | `usdc.faucet` | 70,128 | `0x07d63c5e16d1bab438bf541be288045d34b929e43fc5beeed6a247464011a89b` |
| 13 | faucet 1,000 mock USDC to Sofía (fan) | Sofía (fan) | `usdc.faucet` | 70,128 | `0x331a0cd2daecd59485a4a4486b208b3d198c772bdcbdf40887c3671dfe9059b7` |
| 14 | Casita Jalatlaco (host) approves campaign budget | Casita Jalatlaco (host) | `usdc.approve` | 57,311 | `0xd3dcb55ab889396e752b5776f493107912ea2e1ab37a49b62561d3d5e30e5a0d` |
| 15 | Casita Jalatlaco (host) sponsors stop "Hunt cache · Jardín Etnobotánico" (300 USDC, 10% platform fee) | Casita Jalatlaco (host) | `rewards.createCampaign` | 390,120 | `0xa521899c5f24c021c25ccddf75077980b98b4686955418957a8310e4b536f41f` |
| 16 | Marisol (local guide) approves campaign budget | Marisol (local guide) | `usdc.approve` | 57,311 | `0x6886c06703f42b8d915be00f74478dd37c5ccc7b578ebdb3c1e65030e65de228` |
| 17 | Marisol (local guide) sponsors stop "Marisol's meeting point · Santo Domingo" (200 USDC, 10% platform fee) | Marisol (local guide) | `rewards.createCampaign` | 314,806 | `0x6151835ddc8b259dc2f15e2f2658a9ba93494cb2dc6203a11568f579e2f7ab24` |
| 18 | Lumbre (artist) approves campaign budget | Lumbre (artist) | `usdc.approve` | 57,311 | `0xe0f1efa1df1c63cbfdcaad5af6f373343c8f3f7a5977f828c6e31e3611e996e9` |
| 19 | Lumbre (artist) sponsors stop "Lumbre mural · Calle Macedonio Alcalá" (100 USDC, 10% platform fee) | Lumbre (artist) | `rewards.createCampaign` | 314,792 | `0x987940536e6bebb1f4206b7b53ab690f8058a36e44d8fb2b6885a31842ded705` |
| 20 | Foro Lumbre Oaxaca (venue) approves campaign budget | Foro Lumbre Oaxaca (venue) | `usdc.approve` | 57,311 | `0x9c7123e918ff9b0543bc4d7aaf6b370ee03be9c8db55080bc9f6392d04e2c5e2` |
| 21 | Foro Lumbre Oaxaca (venue) sponsors stop "Foro Lumbre Oaxaca · patio murals" (80 USDC, 10% platform fee) | Foro Lumbre Oaxaca (venue) | `rewards.createCampaign` | 314,726 | `0xf1d29c228278993c4298546aa94169c1640c76b6eac85cf02f4eefa0b8ffd1cf` |
| 22 | Foro Indie CDMX (venue) approves campaign budget | Foro Indie CDMX (venue) | `usdc.approve` | 57,311 | `0xd0886565eb44a186f1999b169b9e6bea1b184fc7fca18b24a6846b8875f8d643` |
| 23 | Foro Indie CDMX (venue) sponsors stop "Foro Indie CDMX · Roma mural walk" (60 USDC, 10% platform fee) | Foro Indie CDMX (venue) | `rewards.createCampaign` | 314,726 | `0x00e69cc7781f5895477f1d302de824af624ad3b031200957d8edf4dd582f6594` |
| 24 | Marisol (local guide) lists "Mezcal & Monte Albán day tour" at 45 USDC | Marisol (local guide) | `bookings.createListing` | 223,485 | `0xb18979badf8f8302cb115ea6b7db289ba2c26c7a751b2b61427fce529c7beb08` |
| 25 | Casa Azul (host) lists "Casa Azul · garden room" at 38 USDC | Casa Azul (host) | `bookings.createListing` | 226,590 | `0x52c2b8b5991772b70f9e099ca84d5f919fd5952b40accc3585303485d1bdd1b1` |
| 26 | Casita Jalatlaco (host) lists "Casita Jalatlaco · whole casita" at 42 USDC | Casita Jalatlaco (host) | `bookings.createListing` | 257,778 | `0xb4b4016e2232d48dd3c76dc7b4b6b0cfd5e8dd589ce0c011455ef0ef4736c375` |
| 27 | Luis (friend) lists "Random hostel (not on the leash)" at 25 USDC | Luis (friend) | `bookings.createListing` | 257,592 | `0x3f95b41dcdc893a08b1b80a8c34f50578aea07521445e8fbaae9e5547d7f94b6` |
| 28 | Marisol (local guide) lists "Coyoacán & Frida walk" at 35 USDC | Marisol (local guide) | `bookings.createListing` | 207,662 | `0xb2ee7fd390328216ed581d9dc00eeeb9f2767973776735f97750ee139fea6395` |
| 29 | Casa Roma (host) lists "Casa Roma · garden loft" at 55 USDC | Casa Roma (host) | `bookings.createListing` | 226,563 | `0xd57a38cf3296cfd8d00256d9a7bf936521b5881e2947ae98210b5f64e6d97eb0` |
| 30 | EmpowerTours approves Marisol as a perk partner | EmpowerTours admin (deployer) | `perks.setPartner` | 66,411 | `0xb735a55eb074f5d02dc4cefb9a5f9c9a4f25ffc0c4325cd80adb1b31cfbb420d` |
| 31 | Lumbre lists perk "Backstage pass · Lumbre live in Oaxaca" for 150 $TOURS | Lumbre (artist) | `perks.listPerk` | 212,797 | `0x8f7c38ee1984dc056e03c306b24baef5c50305d41ef71c762c61900db01f22e4` |
| 32 | Marisol Tours lists perk "10% off the Mezcal & Monte Albán tour" for 60 $TOURS | Marisol (local guide) | `perks.listPerk` | 194,015 | `0xdc66f10144b5385f1a935ad41668e5b59d770a893a5ac445d8a85339a765983d` |
| 33 | Foro Lumbre Oaxaca (venue) lists venue "Foro Lumbre Oaxaca" (70/30 ticket split, 50 USDC deposit, 20 cancel fee) | Foro Lumbre Oaxaca (venue) | `venues.listVenue` | 246,681 | `0xc7c718be6470f72e55210460ddd5f1c1dbaff9ba0de3645df76824cdc6e316b1` |
| 34 | Foro Lumbre Oaxaca opens its calendar (next 14 days) | Foro Lumbre Oaxaca (venue) | `venues.setOpenDates` | 494,477 | `0x2d21e63caf85199f57b14439bf35537ddc48098f65ac6ef9dace78129f00021c` |
| 35 | Foro Indie CDMX (venue) lists venue "Foro Indie CDMX" (flat fee 80 USDC, 30 cancel fee) | Foro Indie CDMX (venue) | `venues.listVenue` | 249,866 | `0x3878181b02d76332c72f3c90b8dfe72d979887ee60b5ae74e3d7e4b6ace6e4ed` |
| 36 | Foro Indie CDMX opens its calendar (next 14 days) | Foro Indie CDMX (venue) | `venues.setOpenDates` | 494,490 | `0x176b91f3a44316c9f1f664c362048fc96b809ce1b1417352187aaa80b6c02002` |
| 37 | Casa Azul (host) lists venue "Bar La Cantina (not on the leash)" (80/20) | Casa Azul (host) | `venues.listVenue` | 300,510 | `0x2c91eecfefdf155eb9e2a3db7b8dc778278212d879b75f72dc1c1bf69084148a` |
| 38 | Bar La Cantina (not on the leash) opens its calendar (next 14 days) | Casa Azul (host) | `venues.setOpenDates` | 494,490 | `0x8435bb937b601c0aa55f2c0404b1e46c752177ea3e30ed901f268e9258c2453f` |
| 39 | Foro Lumbre Oaxaca registers its door-scanner key | Foro Lumbre Oaxaca (venue) | `venues.setScanner` | 77,103 | `0x988fa14e12f92f4f56c49647148a74e8ed46177f6e1bb7a2ee6d68803e772f03` |
| 40 | Foro Indie CDMX registers its door-scanner key | Foro Indie CDMX (venue) | `venues.setScanner` | 77,116 | `0x7559fa07963a9105aa434c7d06b44b5f2e80fd373a3572bed284dbe5adab33a6` |
| 41 | Foro Indie CDMX turns on manual approval (bookings arrive as requests) | Foro Indie CDMX (venue) | `venues.setManualApproval` | 76,243 | `0x8496d5aaf58e87a4104aefae287b84794057d8dfbdb02e29d62d1c1f970705df` |
| 42 | Marisol (local guide) registers its own phone as check-in scanner | Marisol (local guide) | `bookings.setScanner` | 58,122 | `0x57c608a588d0a8715b970efa7508c312f911ab9065bfa0acdde8aef27f4521a0` |
| 43 | Casa Azul (host) registers its own phone as check-in scanner | Casa Azul (host) | `bookings.setScanner` | 58,122 | `0xb1c3f082e548368e646b8aeba610a165b69bca265c95ee18130ee97594164a91` |
| 44 | Casita Jalatlaco (host) registers its own phone as check-in scanner | Casita Jalatlaco (host) | `bookings.setScanner` | 58,122 | `0x54b0284b1d30f40267ccf89e154fed5e016c589c2cca7d7eee420a27be7add17` |
| 45 | Casa Roma (host) registers its own phone as check-in scanner | Casa Roma (host) | `bookings.setScanner` | 58,122 | `0xe29b1b104dfd4aa8c4494ae4bab81d95a8b2a4a75f20bf1e6f03eed0d60b8cdf` |

## 1. Ana opens an Oaxaca trip vault with a leash; Luis chips in

| # | Action | From | Call | Gas | Tx hash |
|---|---|---|---|---|---|
| 46 | Ana creates trip "Oaxaca, MX · March 2027", goal 500 USDC, leash: 3 vendors, total cap 450 | Ana (traveler) | `factory.createVault` | 756,407 | `0x5a4aaecafcde141f99d305f03bf8fb75a360749981f47437e61454884d9c7c54` |
| 47 | Ana approves 200 USDC | Ana (traveler) | `usdc.approve` | 57,311 | `0x3216e4edce3b2b0f5c5c60d95e0fa905d6b3ae0183d0e87336dc832c9eda5d1d` |
| 48 | Ana saves 200 USDC (auto-supplied to the lending pool) | Ana (traveler) | `TripVault.deposit` | 477,243 | `0xfde6179797bc87caede47ba2e87021d1cac1376138d1b1eaa02b996562a41bfb` |
| 49 | Luis approves 100 USDC | Luis (friend) | `usdc.approve` | 57,311 | `0xb02173150d1b06d2a2d4f23fc77a8d9f7eacfee5acaf115e3842559735fd0ad8` |
| 50 | Luis chips in 100 USDC to Ana's trip | Luis (friend) | `TripVault.deposit` | 382,245 | `0xf7e59785951878abfa9e0374fd81c4951bf5e4f1877885cc01378599a85d6e9e` |

## 2. Twelve days of proved visits (Hunt GPS attestation) → rewards straight into the trip

| # | Action | From | Call | Gas | Tx hash |
|---|---|---|---|---|---|
| 51 | day 1: 2 visits (Hunt cache, Marisol's meeting point) in ONE batched claim (Ana submits it and pays her own gas) | Ana (traveler) | `rewards.claimBatch` | 689,187 | `0x73f18c4f47da3948e07974d7bbfeed57c206ebacb0bfb11ea4e2baa0ff854141` |
| 52 | day 2: 2 visits (Hunt cache, Marisol's meeting point) in ONE batched claim (Ana submits it and pays her own gas) | Ana (traveler) | `rewards.claimBatch` | 573,712 | `0xdca4f00aa2677e228c3f915af047efa8ba8cd261681a05fe1d0b079073733ca7` |
| 53 | day 3: 2 visits (Hunt cache, Lumbre mural) in ONE batched claim (Ana submits it and pays her own gas) | Ana (traveler) | `rewards.claimBatch` | 592,561 | `0xf14b63e1cba39b5c3903e1f98928826fc28659e256d1d06d7fcb21bd520d2dfe` |
| 54 | day 4: 3 visits (Hunt cache, Marisol's meeting point, Foro Lumbre Oaxaca) in ONE batched claim (Ana submits it and pays her own gas) | Ana (traveler) | `rewards.claimBatch` | 645,159 | `0x3f54c90e45539926eee5bd163ecd39950f5ada3192599e981eaeeede69407ef1` |
| 55 | day 5: 2 visits (Hunt cache, Marisol's meeting point) in ONE batched claim (Ana submits it and pays her own gas) | Ana (traveler) | `rewards.claimBatch` | 614,513 | `0x72c60143599818ec7fc839a11bae2a1119ef33c2e4a2a63103434f5ca7ccb9ed` |
| 56 | day 6: 2 visits (Hunt cache, Lumbre mural) in ONE batched claim (Ana submits it and pays her own gas) | Ana (traveler) | `rewards.claimBatch` | 592,561 | `0x496f42044c46fbd457dc3262f088192809acc02eb7ca3273caa338918637378f` |
| 57 | day 7: 2 visits (Hunt cache, Marisol's meeting point) in ONE batched claim (Ana submits it and pays her own gas) | Ana (traveler) | `rewards.claimBatch` | 573,712 | `0xad85814a78272399f5ec0718702057faf249504f50095af6713032804bfa3d78` |
| 58 | day 8: 3 visits (Hunt cache, Marisol's meeting point, Foro Lumbre Oaxaca) in ONE batched claim (Ana submits it and pays her own gas) | Ana (traveler) | `rewards.claimBatch` | 645,133 | `0xcedcd5d2fb350f7fff6ca7cc5ce0b9eb173076c4131a78fad24919874de31889` |
| 59 | day 9: 2 visits (Hunt cache, Lumbre mural) in ONE batched claim (Ana submits it and pays her own gas) | Ana (traveler) | `rewards.claimBatch` | 576,790 | `0x4cf4b6dc55626b53ed3287f43bce3c63d070baa7e900e86b3217738496a0a56e` |
| 60 | day 10: 2 visits (Hunt cache, Marisol's meeting point) in ONE batched claim (Ana submits it and pays her own gas) | Ana (traveler) | `rewards.claimBatch` | 576,816 | `0x1e5096ea93ae9a55a6a638d67285f68fe2d1d86cae85699445bbb4c5476a5852` |
| 61 | day 11: 2 visits (Hunt cache, Marisol's meeting point) in ONE batched claim (Ana submits it and pays her own gas) | Ana (traveler) | `rewards.claimBatch` | 573,712 | `0xac43e87e2a570a4d0e3b2697772a9439e9e6a37c000d5a19da3060b03c9cbf9c` |
| 62 | day 12: 3 visits (Hunt cache, Lumbre mural, Foro Lumbre Oaxaca) in ONE batched claim (Ana submits it and pays her own gas) | Ana (traveler) | `rewards.claimBatch` | 626,298 | `0x364fdc5fdc36b74cc26b27d25c758bf4c07d8a232b9e3d72e48105f7c071194c` |

## 3. Yield accrues; Ana and Luis back an artist; Ana redeems a perk with $TOURS

| # | Action | From | Call | Gas | Tx hash |
|---|---|---|---|---|---|
| 63 | DEMO ONLY: mock lending pool simulates 30 days of 5% APR (Solonet cannot warp time) | EmpowerTours admin (deployer) | `pool.fastForward` | 60,678 | `0x84e7270ce77785b8e88ba4a6da1fdd95eb68d069b099a175cda8136d0ab8b74d` |
| 64 | Lumbre opens a fan-backed tour fund (leash: Foro Oaxaca ≤100, Foro CDMX ≤150) | Lumbre (artist) | `factory.createVault` | 652,933 | `0xe0f19e0fcf3964067ed18c1fe5043ea8e0c4153f57154eea6e2f138fde3e0818` |
| 65 | Lumbre approves 200 USDC | Lumbre (artist) | `usdc.approve` | 57,311 | `0xc34c61527ca27107d7aecb99cc7dfd55fde97f169e8b1a10982fdcd68c9f8736` |
| 66 | Lumbre puts 200 USDC of her own into the tour fund | Lumbre (artist) | `TripVault(artist).deposit` | 458,246 | `0x9062aa4f48a2f5f3cf63437d38c9153644bfb2ee4b2b2c54b53a5628e0841a63` |
| 67 | Luis approves 40 USDC | Luis (friend) | `usdc.approve` | 57,311 | `0x478157480b24eea1b3d39c6e01cefb5885be4a35b0fc6bda82ac73c9f21ac734` |
| 68 | Luis backs Lumbre's tour with 40 USDC (perks, not a revenue share) | Luis (friend) | `TripVault(artist).deposit` | 382,245 | `0x3bfe42c744dc906f937b64dcc0fc998331edc649c301f5a236c07e70d6a23a03` |
| 69 | Ana approves 20 USDC | Ana (traveler) | `usdc.approve` | 57,311 | `0x45fe65c998e494a3d5511ddb7211aa301df1f3026ee67af121963ab93e2aa629` |
| 70 | Ana backs Lumbre's tour with 20 USDC | Ana (traveler) | `TripVault(artist).deposit` | 382,258 | `0x41fc42768dfcfb30f4d7e5834bdcb43d0f09b721d6f30c944890719d4a9e35bb` |
| 71 | Ana approves PerkMarket for 150 $TOURS | Ana (traveler) | `tours.approve` | 57,374 | `0x5824545e514b423ad0eceb925c5c73c056f437a350145d9b5b47aa6d746d0241` |
| 72 | Ana redeems "Backstage pass · Lumbre live in Oaxaca" (150 $TOURS burned) | Ana (traveler) | `perks.redeem` | 238,002 | `0x978ce4fdcc91acea54dba432f4d5b63494f9adcb8c33db99270e603de6abc960` |

## 4. Trip window opens: the vault books a guide and a stay through escrow

| # | Action | From | Call | Gas | Tx hash |
|---|---|---|---|---|---|
| 73 | vault books Mezcal & Monte Albán tour for 2 (90 USDC into escrow) | Ana (traveler) | `TripVault.book` | 665,648 | `0x404585fb7dede236bdf797e664d85a06f966082b9eceab70d6ca56d245299998` |
| 74 | vault books 3 nights at Casa Azul (114 USDC into escrow) | Ana (traveler) | `TripVault.book` | 592,803 | `0xedd99352b44c1c67cdedba1725b17726fb2e154a5621d09eebb17155a31e282a` |
| 75 | Casa Azul cancels → automatic full refund to the vault, leash allowance restored | Casa Azul (host) | `bookings.hostCancel` | 433,551 | `0xe829809112cd56b85062cb6e597a07559fb1dcd7722673cfdea69fc9f2e5c337` |
| 76 | vault re-books 3 nights at Casita Jalatlaco (126 USDC into escrow) | Ana (traveler) | `TripVault.book` | 573,806 | `0x3af0ee9cbfc16e9bbd6262fc3e705fc1279a0989191d149052cd3b9c44da518b` |
| 77 | Marisol accepts the booking | Marisol (local guide) | `bookings.acceptBooking` | 76,198 | `0xcdba040de758296b7e01de7a09a6e9e17843bb13e2a3a1ffd0b45e0b5c3b71a3` |
| 78 | Marisol scans Ana in with her registered scanner → tour escrow released (3% fee to treasury) | Marisol (local guide) | `bookings.confirmWithAttestation` | 496,359 | `0x66551ae221337244831dc589f49a7128ffe6a0d0f33f5fc6bfa1254b0cf4d20a` |
| 79 | Ana confirms check-in at Casita Jalatlaco → stay escrow released | Ana (traveler) | `TripVault.confirmCheckIn` | 512,883 | `0x241a92aa2b09c7095670a272ea899a8501310db6559e1cbf484178eb7a355cca` |
| 80 | Ana anchors her tour review (rating 5 + keccak256 of the text) | Ana (traveler) | `bookings.anchorReview` | 135,982 | `0xd70b2a1b2e7612f056494b73b22ea611dc01fa1b9e44ddcabb74a05e908c66ee` |
| 81 | Ana anchors her stay review | Ana (traveler) | `bookings.anchorReview` | 135,995 | `0x17590e77bfdeae554d5a49cc76b3cc8766dea06ab9010a9c8f4a089f8e5d4846` |

## 5. Lumbre's tour: venue bookings, ticket sales, a show and a cancellation

| # | Action | From | Call | Gas | Tx hash |
|---|---|---|---|---|---|
| 82 | tour fund books Foro Lumbre Oaxaca for tonight (50 USDC deposit into escrow, 70/30 split) | Lumbre (artist) | `TripVault(artist).bookVenue` | 829,302 | `0x0c1e024cece19a9ff4ee0aaf21e2f6f07db7d837021c09295e68487ca472d277` |
| 83 | tour fund books Foro Indie CDMX for tomorrow (80 USDC flat fee into escrow) | Lumbre (artist) | `TripVault(artist).bookVenue` | 811,679 | `0x7a368343f41fc0297fc6856ace12b661a5c32a6a02ab4439e6e3c5a17dacaefe` |
| 84 | Foro Indie CDMX accepts Lumbre's booking request → tickets go on sale | Foro Indie CDMX (venue) | `venues.acceptShow` | 57,028 | `0x6df852527cfe4d2e2d33d71fb12aa726989493199e2444c2f2bfba5f249179ea` |
| 85 | Ana (traveler) approves 12 USDC | Ana (traveler) | `usdc.approve` | 57,297 | `0xdfff04bb970828b47c3f12182ab2ee8488ce56baaadddafc72b956c9a2ad385b` |
| 86 | Ana buys 1 ticket for Oaxaca (escrow) | Ana (traveler) | `tickets.buy` | 371,223 | `0x9d675b15a09943368de89f66e4027149ec93b171151831ddfcc96243481383f2` |
| 87 | Ana (traveler) approves 15 USDC | Ana (traveler) | `usdc.approve` | 57,311 | `0x3b08a055bea5968c1d5ee2c726a1bde4abc522fbef907e920e0d9879688764e6` |
| 88 | Ana buys 1 ticket for CDMX (escrow) | Ana (traveler) | `tickets.buy` | 358,611 | `0x4173129639d8a6e02f480b878bc015a458a7a276f25ffde08ebb03f1c7083200` |
| 89 | Luis (friend) approves 24 USDC | Luis (friend) | `usdc.approve` | 57,311 | `0x3c70418574b83f2f15bab432a5e230b8f77dcb564d78ee0d9174985015ededb1` |
| 90 | Luis buys 2 tickets for Oaxaca | Luis (friend) | `tickets.buy` | 418,190 | `0x062a286e8502077fa3774ecdba5dc5868e98d5544740ae2d3197136fb725c04b` |
| 91 | Sofía (fan) approves 24 USDC | Sofía (fan) | `usdc.approve` | 57,311 | `0x310ada7c91cc280cc434fee6ec7ee6a47f5bb64cbcc811768cc5adc513c24055` |
| 92 | Sofía buys 2 tickets for Oaxaca | Sofía (fan) | `tickets.buy` | 418,190 | `0x618296cf666d9c7c845c54002f481881e2806996316f566788eead684b618933` |
| 93 | Sofía (fan) approves 30 USDC | Sofía (fan) | `usdc.approve` | 57,324 | `0xd4b7e14a0b57e18f8a975e8ae6eabc716be4ee96a423d002bc23289e5fd9e37e` |
| 94 | Sofía buys 2 tickets for CDMX | Sofía (fan) | `tickets.buy` | 399,368 | `0x1076706ede1adbcc8509668255d1cd787392a321f02c30030956ece0aeef7100` |
| 95 | Luis claims backing $TOURS (unlocked by the share of tour money actually spent) | Luis (friend) | `rewards.claimBacking` | 211,983 | `0xab51db3e90e5f976cc9254f5be69bc37cebc3e57870440b925e155ee3f5803a9` |
| 96 | door scan: Ana (traveler)'s ticket #0 (check-in → $TOURS + streak; venue submits, pays gas) | Foro Lumbre Oaxaca (venue) | `tickets.scan` | 244,622 | `0xb160cee34ef50a34959ccb50bc9be8e107727d9e7d3b85abf139853653f2e5dc` |
| 97 | door scan: Luis (friend)'s ticket #2 (check-in → $TOURS + streak; venue submits, pays gas) | Foro Lumbre Oaxaca (venue) | `tickets.scan` | 240,825 | `0x1acf870b1c9816f348caef166a3990506206fcb0bb867c7289845d11cb779690` |
| 98 | door scan: Luis (friend)'s ticket #3 (check-in → $TOURS + streak; venue submits, pays gas) | Foro Lumbre Oaxaca (venue) | `tickets.scan` | 218,880 | `0xdc32a22e883a940e5612867e313ff0c34a7829bd148c59218e9087d95fd7daa5` |
| 99 | door scan: Sofía (fan)'s ticket #4 (check-in → $TOURS + streak; venue submits, pays gas) | Foro Lumbre Oaxaca (venue) | `tickets.scan` | 259,673 | `0xeabaa6d083f55fe49a8b45ba5a049b822ff3c7f6613eb643627789f8d85dec06` |
| 100 | Sofía passes her spare ticket to Luis (already a holder → allowed) | Sofía (fan) | `tickets.transferTicket` | 168,942 | `0xe1b194ea26408a6db851e1a70ab9ff2ba868386f13853822e6dd5af1da309450` |
| 101 | Foro Oaxaca submits its door-QR check-in attestation → show Played, deposit released (3% fee) | Foro Lumbre Oaxaca (venue) | `venues.confirmShow` | 503,257 | `0xab90c957a38a7f886a31659d593d49a13c482e6efe66c2f5668be6f51a398808` |
| 102 | settle Oaxaca ticket escrow → 4% fee, venue 30%, Lumbre 70% (Lumbre triggers it) | Lumbre (artist) | `tickets.settle` | 213,262 | `0x708387aadf5ccf5292decc8a78d587fdae1c52a7986d6905c004c2b11597dbeb` |
| 103 | Foro Indie CDMX cancels → Lumbre's tour fund refunded automatically (80 USDC), leash restored | Foro Indie CDMX (venue) | `venues.venueCancel` | 480,276 | `0xb0be14ab37797507643a1126919058231995d412d743d6fe7de082ad1a238f3d` |
| 104 | refund every CDMX ticket holder in one call (anyone can trigger; the venue does) | Foro Indie CDMX (venue) | `tickets.refundAll` | 194,012 | `0x8eb57fb91950a306635fb812a66a6bf54a1e447d9af2dfdd9ff4462e130d9c95` |

## 5b. Resale (≤110% of face, artist royalty, EmpowerTours fee), the door lock, and open requests for the UI

| # | Action | From | Call | Gas | Tx hash |
|---|---|---|---|---|---|
| 105 | tour fund books Foro Lumbre Oaxaca again in 3 days (50 USDC deposit) | Lumbre (artist) | `TripVault(artist).bookVenue` | 703,289 | `0x7f7a07a4c1d2966dada0e9584ac237afd7d9cceee23ad63fc59861329b9d50b8` |
| 106 | Luis (friend) approves 24 USDC | Luis (friend) | `usdc.approve` | 57,311 | `0xcdd231b0cf54b1005054e4db0ca96e1375bb6d1d2edd894f6ceec228326ef29c` |
| 107 | Luis buys 2 tickets for Oaxaca night 2 | Luis (friend) | `tickets.buy` | 456,201 | `0x74871b3c06301139f16bb51f85b56727819210cb2c946d3a08d7bdb889ef86b7` |
| 108 | Sofía (fan) approves 12 USDC | Sofía (fan) | `usdc.approve` | 57,297 | `0xc31d7183fab272f281317f2be0125458e85315ea30e3ed378a3f79232798afe3` |
| 109 | Sofía buys 1 ticket for Oaxaca night 2 | Sofía (fan) | `tickets.buy` | 320,599 | `0xc62a57f38ea94515efed4c4e7c89811c8e8c32db251f7f9c13b62a47ed7074eb` |
| 110 | Luis lists ticket at 13.20 USDC (110% of face) | Luis (friend) | `tickets.listForResale` | 109,661 | `0x6f2179ca7f1d5ea73e1326edd0ad380ea15fc87d08112cc8f99554f350217b72` |
| 111 | Ana approves 13.20 USDC | Ana (traveler) | `usdc.approve` | 57,311 | `0x2b64442c95c7c12923883cd80b29524fb6b1c343c4c78a99fdc295c3c22cc592` |
| 112 | Ana buys Luis's resale ticket → 4% fee, 5% royalty to Lumbre, rest to Luis | Ana (traveler) | `tickets.buyResale` | 315,718 | `0xf2670fd363939232d4dc9a58e3b2c4fc6d676cf3d31156b1feb848c79e6596b8` |
| 113 | Luis lists his second ticket at 12.60 USDC (left open for the UI) | Luis (friend) | `tickets.listForResale` | 109,661 | `0x0516bf1a0b7260bb29c113281e045ed3ebad38ec5b966c1d0258a82ba1a5d51f` |
| 114 | tour fund requests Foro Indie CDMX in 5 days (80 USDC deposit; waits for the venue) | Lumbre (artist) | `TripVault(artist).bookVenue` | 824,550 | `0xb005e7196100a06b5abe3647b635f63d21835d1d193d218ada767c3e43522aae` |
| 115 | vault books 1 night at Casa Azul (38 USDC; left for the host to accept in the UI) | Ana (traveler) | `TripVault.book` | 630,797 | `0x57e1fb4acb0d98aa9899d5c95c3e9e0db2a624b8350a23019538a49cf328abe8` |

## 6b. In the Rumbo UI: real transactions from a Mera passkey wallet and DEV test accounts (`demo/ui-flows.mjs` → `demo/ui-flows.json`)

Headless Chromium on http://localhost with the CDP virtual authenticator (PRF extension on), so the Mera passkey ceremony, PRF → key derivation and in-page signing are the real code paths. Gas is from the confirmation toast (= the receipt).

| Step | Result | Gas |
|---|---|---:|
| [en] 0-MON wallet + signed out: 16 route visits, 0 console errors, 0 tx attempts | confirmed · 0x2531535724c67b084339E00C58b3BC7818Bff40b | — |
| [en] 0-MON wallet clicks "Buy a ticket" → top-up sheet (need 0.0534 MON, suggested 0.07 MON); nothing sent | confirmed | — |
| [en] after top-up, auto-continued: Approve 12 USDC | confirmed | 57,297 |
| [en] after top-up, auto-continued: Buy a ticket · Lumbre live · Oaxaca (night 2) | confirmed | 339,447 |
| [es] 0-MON wallet + signed out: 16 route visits, 0 console errors, 0 tx attempts | confirmed · 0x0E4F7e3b1E944604FC94B18C4C0C1F9d64a0E654 | — |
| [es] 0-MON wallet clicks "Buy a ticket" → top-up sheet (need 0.0534 MON, suggested 0.07 MON); nothing sent | confirmed | — |
| [es] after top-up, auto-continued: Aprobar 12 USDC | confirmed | 57,297 |
| [es] after top-up, auto-continued: Comprar boleto · Lumbre live · Oaxaca (night 2) | confirmed | 339,447 |
| [en] create passkey wallet | confirmed · 0x53d5E20bAa5B7f30948E3eb293114a59A9fB4ca8 | — |
| [en] sign back in (same address) | confirmed · 0x53d5E20bAa5B7f30948E3eb293114a59A9fB4ca8 | — |
| [en] private note sealed with the second PRF secret | confirmed | — |
| [en] passkey wallet: get 1,000 test USDC (?drip=1: DEV drip opted in) | confirmed | 70,128 |
| [en] passkey wallet: buy a ticket for Oaxaca night 2 | confirmed | 339,447 |
| [en] passkey wallet: list the ticket for resale at 110% of face | confirmed | 109,661 |
| [es] create passkey wallet | confirmed · 0x745f68F1a39CD9d7C3377c4A441A9b3ED2D08867 | — |
| [es] sign back in (same address) | confirmed · 0x745f68F1a39CD9d7C3377c4A441A9b3ED2D08867 | — |
| [es] private note sealed with the second PRF secret | confirmed | — |
| [es] passkey wallet: get 1,000 test USDC (?drip=1: DEV drip opted in) | confirmed | 70,128 |
| [es] passkey wallet: buy a ticket for Oaxaca night 2 | confirmed | 339,447 |
| [es] passkey wallet: list the ticket for resale at 110% of face | confirmed | 109,661 |
| DEV Foro Indie CDMX: accept Lumbre's booking request | confirmed | 57,028 |
| DEV Casa Azul: accept Ana's booking | confirmed | 76,211 |
| DEV Casa Azul: register this wallet as check-in scanner | skipped | — |
| DEV Casa Azul: scan Ana in → escrow released | confirmed | 496,359 |
| DEV Ana: contribute 25 USDC to the trip vault | confirmed | 271,166 |
| DEV Ana: check in at a stop (local Hunt attester, claimBatch) | confirmed | 520,441 |
| DEV Sofía: buy Luis's resale ticket (fee + royalty + seller) | confirmed | 278,021 |
| DEV Ana: redeem a perk with $TOURS points | confirmed | 228,320 |

### 6c. Rumbo with a zero-MON wallet, no gas sponsorship

A brand-new Mera passkey wallet with **0 MON** (DEV drip off). Every route was visited signed out and signed in; a ticket purchase opened the top-up sheet instead of sending; a Solonet test account then sent the suggested MON and the purchase finished by itself.

| Lang | Route visits | Console errors | Tx attempts while short | Sheet: needed / suggested | Funded | Txs after funding | MON actually spent |
|---|---:|---:|---:|---|---|---|---:|
| en | 16 | 0 | 0 | 0.0534 MON / 0.07 MON | 0.07 MON @ #1362 | 57,297 + 339,447 gas | 0.040468 |
| es | 16 | 0 | 0 | 0.0534 MON / 0.07 MON | 0.07 MON @ #1462 | 57,297 + 339,447 gas | 0.040468 |

"~X MON" hints shown on buttons for the 0-MON wallet: faucet ~0.009 MON · contribute ~0.041 MON · checkin ~0.064 MON · buyResale ~0.046 MON · buyTicket ~0.054 MON.
