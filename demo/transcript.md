# Demo transcript: Oaxaca trip that saves itself while you play

Generated 2026-10-16T14:27:06.650Z on LOCAL Monad Solonet (chain 20143, http://localhost:8080). Mock USDC, test accounts. Nothing public.

Monad charges the gas **limit**, so every tx is sent with limit = estimate × 1.10; "gas used" below equals the limit charged.

## Outcome

- Trip vault `0x5bF2807C5A486a946aeF2Bd6126D86305286E4aD`: **64.36% funded (321.817209 / 500 USDC incl. 216 already spent on bookings)**
- Vault balance now 105.817209 USDC; principal 320.5; yield earned 1.317209 USDC (mock pool, 30 simulated days)
- Streak: **13 days** (best 13); 27 proved visits
- $TOURS: Ana 296 earned → 176 after a 150 perk (burned); Luis 40 from backing; supply 226
- Treasury revenue: 77.9 USDC (sponsor fees 68 + booking fees 6.48)
- Check-ins: 27 visits in **12 batched claims** (one per day) + Ana's show ticket scan → streak 13
- Oaxaca show: 4 tickets, gross 48 USDC → Lumbre 32.256, Foro Oaxaca 13.824, fee 1.92; venue deposit released 48.5
- CDMX show: venue cancelled → 80 USDC back to Lumbre's tour fund, 3 tickets (45 USDC) refunded; escrows now tickets 0 / venues 0
- Venue reliability: Oaxaca 1 held / 0 cancelled; CDMX 0 / 1
- Treasury fee breakdown: sponsor 68 + bookings 6.48 + venue deposits 1.5 + tickets 1.92
- Casa Azul cancellation: refunded automatically; Ana's leash allowance for that host back to 0 USDC spent
- 84 transactions, 26,714,723 gas, 2.7249 MON at Solonet's 100 gwei base fee

## Refused by the contracts (simulated, never sent)

| Section | Attempt | By | Revert |
|---|---|---|---|
| 1 | Ana tries to pay Marisol before the trip window opens | Ana (traveler) | `TripNotStarted()` |
| 2 | replay the same signed batch | EmpowerTours/Hunt relayer (deployer) | `VisitReused(0x449ab287dd1932063f31eafe96cc77a9ab7c4a8a59fa0a2362300b8976b2dae3)` |
| 2 | single claim for a stop already claimed in that day's batch | EmpowerTours/Hunt relayer (deployer) | `AlreadyClaimedToday(20741)` |
| 2 | Luis forges his own batch attestation | Luis (friend) | `BadAttestation()` |
| 3 | Ana tries to send $TOURS to Luis (points mode) | Ana (traveler) | `NonTransferable()` |
| 4 | book a hostel whose owner is not on the leash | Ana (traveler) | `NotApprovedVendor(0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC)` |
| 4 | book 4 nights at Casita Jalatlaco (168 > 160 USDC cap) | Ana (traveler) | `VendorCapExceeded(0x9965507D1a55bcC2695C58ba16FB37d819B0A4dc, 168000000, 160000000)` |
| 5 | tour fund books a venue that is not on the leash | Lumbre (artist) | `NotApprovedVendor(0x15d34AAf54267DB7D7c367839AAf71A00a2C6A65)` |
| 5 | scan Ana's ticket a second time | EmpowerTours/Hunt relayer (deployer) | `AlreadyUsed()` |
| 5 | buy a ticket for the cancelled CDMX show | Sofía (fan) | `NotOnSale()` |

## 0. Partners set up (sponsored stops, listings, perks)

| # | Action | From | Call | Gas | Tx hash |
|---|---|---|---|---|---|
| 1 | faucet 1,000 mock USDC to Ana (traveler) | Ana (traveler) | `usdc.faucet` | 70,128 | `0xfc8431b47f056e4d5202b8ad75c9afb9f1ca262965c39a57be9314edcaf9056b` |
| 2 | faucet 1,000 mock USDC to Luis (friend) | Luis (friend) | `usdc.faucet` | 70,115 | `0x2cd1aab465e23a88010203a94b2c00e8d52c14b4911d169727e1a3715d738e69` |
| 3 | faucet 1,000 mock USDC to Marisol (local guide) | Marisol (local guide) | `usdc.faucet` | 70,128 | `0x402c100e9e5e16cc70c91cab28b14d9929ec367bfde832349535b1aa413768a4` |
| 4 | faucet 1,000 mock USDC to Casita Jalatlaco (host) | Casita Jalatlaco (host) | `usdc.faucet` | 70,128 | `0x709ee3b462b2752ab63648a3b46cef94bbc2856b3d03faf6ff1600da27fb4ec5` |
| 5 | faucet 1,000 mock USDC to Lumbre (artist) | Lumbre (artist) | `usdc.faucet` | 70,128 | `0xca7c775c16db3ac9939397abf3532152218d8449d3d62735ea6397801bf78b66` |
| 6 | faucet 1,000 mock USDC to Foro Lumbre Oaxaca (venue) | Foro Lumbre Oaxaca (venue) | `usdc.faucet` | 70,115 | `0x3ab9956aaa8a2fa7a16a37fcdb42284accc4cf415bc69ec1a5616a6732922a3a` |
| 7 | faucet 1,000 mock USDC to Sofía (fan) | Sofía (fan) | `usdc.faucet` | 70,128 | `0x86de09f65ed9e0b87974fe92234cbf91b0fe5e67fd047968425cdece47c7ec8b` |
| 8 | Casita Jalatlaco (host) approves campaign budget | Casita Jalatlaco (host) | `usdc.approve` | 57,311 | `0xf32d974128e0733b3ce8cc7b55d19228b162b328ba1d468f995ae3327983ac39` |
| 9 | Casita Jalatlaco (host) sponsors stop "Hunt cache · Jardín Etnobotánico" (300 USDC, 10% platform fee) | Casita Jalatlaco (host) | `rewards.createCampaign` | 390,120 | `0xa076f92bfddaba373f1278585b7abf65dd32e8a661aa641d58c8a58e5ac7b53a` |
| 10 | Marisol (local guide) approves campaign budget | Marisol (local guide) | `usdc.approve` | 57,311 | `0x39773733394738db17a7bbcef242bf2819640ce2a48d1cbbd69dbe4133d122e8` |
| 11 | Marisol (local guide) sponsors stop "Marisol's meeting point · Santo Domingo" (200 USDC, 10% platform fee) | Marisol (local guide) | `rewards.createCampaign` | 314,806 | `0x4799c39556d8006facd57eb59e3568a35f777dbca2c8470c8a94046ef4d5bcec` |
| 12 | Lumbre (artist) approves campaign budget | Lumbre (artist) | `usdc.approve` | 57,311 | `0xfd1b5afe27ded41269c631e930a267b3e333b2a7db66828bfb43aa57219cd42a` |
| 13 | Lumbre (artist) sponsors stop "Lumbre mural · Calle Macedonio Alcalá" (100 USDC, 10% platform fee) | Lumbre (artist) | `rewards.createCampaign` | 314,792 | `0x6f661280713dae7526052174ed07b82752dd5c7bc60d1ea798e4319e4e059a12` |
| 14 | Foro Lumbre Oaxaca (venue) approves campaign budget | Foro Lumbre Oaxaca (venue) | `usdc.approve` | 57,311 | `0x913ae108dffaab9da283e0fc17a868a43159edc516ad876063ce6a5a7a2bf683` |
| 15 | Foro Lumbre Oaxaca (venue) sponsors stop "Foro Lumbre Oaxaca · patio murals" (80 USDC, 10% platform fee) | Foro Lumbre Oaxaca (venue) | `rewards.createCampaign` | 314,726 | `0x46831d94bde7a6a38db7a734d61d97a486f0f91ee129b7518e60186fab637848` |
| 16 | Marisol (local guide) lists "Mezcal & Monte Albán day tour" at 45 USDC | Marisol (local guide) | `bookings.createListing` | 223,386 | `0x0634c890df103d3a6b9d4a6d8870d03111f6e91702ccbb819ec07f0612bd373d` |
| 17 | Casa Azul (host) lists "Casa Azul · garden room" at 38 USDC | Casa Azul (host) | `bookings.createListing` | 226,491 | `0x2c885f1f69dffb03c8fc8acb06a2131f4aefd7e23df429cb3a33e5e813b585bd` |
| 18 | Casita Jalatlaco (host) lists "Casita Jalatlaco · whole casita" at 42 USDC | Casita Jalatlaco (host) | `bookings.createListing` | 257,680 | `0xa138c2945691365b7cc3168ae5abc04edbbdbf2e704bea4059a62530b0ee9f9b` |
| 19 | Luis (friend) lists "Random hostel (not on the leash)" at 25 USDC | Luis (friend) | `bookings.createListing` | 257,493 | `0xca1dcabf2b13d227f940453679ef13606bc2a1cccd5da7d13635a8a2fb5188f0` |
| 20 | EmpowerTours approves Marisol as a perk partner | EmpowerTours/Hunt relayer (deployer) | `perks.setPartner` | 66,411 | `0x26ce5823ce6466cf82ef5f00c847c755d7ebe165d318e3d59eaec32a8359b1e5` |
| 21 | Lumbre lists perk "Backstage pass · Lumbre live in Oaxaca" for 150 $TOURS | Lumbre (artist) | `perks.listPerk` | 212,797 | `0x7bf9efc66403db1a4903757524c9a020cdca5fafd2f9122eba9d7e677f163d3c` |
| 22 | Marisol Tours lists perk "10% off the Mezcal & Monte Albán tour" for 60 $TOURS | Marisol (local guide) | `perks.listPerk` | 194,015 | `0xeb43688b416832945df77c1d7e3ec0e28245e97d0116f62fc1ec1b51708644b3` |
| 23 | Foro Lumbre Oaxaca (venue) lists venue "Foro Lumbre Oaxaca" (70/30 ticket split, 50 USDC deposit, 20 cancel fee) | Foro Lumbre Oaxaca (venue) | `venues.listVenue` | 247,218 | `0x56e9bd966c468840e0f87db4420fa9f54a8a4a04eff948c33e1159ae44b3ade3` |
| 24 | Foro Lumbre Oaxaca opens its calendar (next 14 days) | Foro Lumbre Oaxaca (venue) | `venues.setOpenDates` | 494,353 | `0xbd9fce4d940dce059cc340bb1f678e3169ae74826b8566f5200f0d6fdebfa154` |
| 25 | Foro Indie CDMX (venue) lists venue "Foro Indie CDMX" (flat fee 80 USDC, 30 cancel fee) | Foro Indie CDMX (venue) | `venues.listVenue` | 250,401 | `0x6d2ac7637e4e53878791156004ed6e3b878ef19b1d6f6a529eab77193d7a9d33` |
| 26 | Foro Indie CDMX opens its calendar (next 14 days) | Foro Indie CDMX (venue) | `venues.setOpenDates` | 494,366 | `0x5ebabcef50f2fc0cce7bb966dd7f93c90b1d9d93e2df364f9d7adca990584167` |
| 27 | Casa Azul (host) lists venue "Bar La Cantina (not on the leash)" (80/20) | Casa Azul (host) | `venues.listVenue` | 301,046 | `0x8082f7d6b90d9cdee29807e3630db85270130a2995d4af2c80bc16fc645c4791` |
| 28 | Bar La Cantina (not on the leash) opens its calendar (next 14 days) | Casa Azul (host) | `venues.setOpenDates` | 494,366 | `0x51fe68b99b807614efb067f0075e977b641f866c9108f2ee566816b1f4971e33` |

## 1. Ana opens an Oaxaca trip vault with a leash; Luis chips in

| # | Action | From | Call | Gas | Tx hash |
|---|---|---|---|---|---|
| 29 | Ana creates trip "Oaxaca, MX · March 2027", goal 500 USDC, leash: 3 vendors, total cap 450 | Ana (traveler) | `factory.createVault` | 756,407 | `0x3e5a347811941d599a9c3b652420de63505ea6faec428b67f75fd172e5fb12af` |
| 30 | Ana approves 200 USDC | Ana (traveler) | `usdc.approve` | 57,311 | `0x2807bdc49ccc2802ef527b04122630bee2420ef3d89b7947f2644a15fe9c5bbf` |
| 31 | Ana saves 200 USDC (auto-supplied to the lending pool) | Ana (traveler) | `TripVault.deposit` | 477,243 | `0x20482de434717d6c1207bde0349770e7acd90ed3ca1924b3ac30beca2d8a795f` |
| 32 | Luis approves 100 USDC | Luis (friend) | `usdc.approve` | 57,311 | `0xf3193e9fb4a549183236d7a66039874780b7f6bd6ea9b556076034cc75065fd1` |
| 33 | Luis chips in 100 USDC to Ana's trip | Luis (friend) | `TripVault.deposit` | 382,245 | `0xa74631a33fc2f68a6587891bf65b8f8b25f21bb2920bf2a3ce35a1f6f761f960` |

## 2. Twelve days of proved visits (Hunt GPS attestation) → rewards straight into the trip

| # | Action | From | Call | Gas | Tx hash |
|---|---|---|---|---|---|
| 34 | day 1: 2 visits (Hunt cache, Marisol's meeting point) in ONE batched claim | EmpowerTours/Hunt relayer (deployer) | `rewards.claimBatch` | 689,201 | `0xaf1ca377c3c62bf2387f2d15be58a1b81bb9a87a05919c6c0ebac6a3c54ddf91` |
| 35 | day 2: 2 visits (Hunt cache, Marisol's meeting point) in ONE batched claim | EmpowerTours/Hunt relayer (deployer) | `rewards.claimBatch` | 573,712 | `0xed11d10f628a44bdc8fb9702afcbb6e914cbb02d4f9f8e4c1bfca223ee383db1` |
| 36 | day 3: 2 visits (Hunt cache, Lumbre mural) in ONE batched claim | EmpowerTours/Hunt relayer (deployer) | `rewards.claimBatch` | 592,548 | `0x02814203c9045fa3a3053054ba2a449f51114faaf4ad9e83db5865e18734eb1f` |
| 37 | day 4: 3 visits (Hunt cache, Marisol's meeting point, Foro Lumbre Oaxaca) in ONE batched claim | EmpowerTours/Hunt relayer (deployer) | `rewards.claimBatch` | 645,146 | `0xd893aca37ec9ec22cac9bb9660d262b574c5d6fbfb4865460fa4fba534471c9a` |
| 38 | day 5: 2 visits (Hunt cache, Marisol's meeting point) in ONE batched claim | EmpowerTours/Hunt relayer (deployer) | `rewards.claimBatch` | 573,712 | `0x72fa9a68004737a9f7728d22ff503e927a7fd63c26b005d7d7537750f3eedb35` |
| 39 | day 6: 2 visits (Hunt cache, Lumbre mural) in ONE batched claim | EmpowerTours/Hunt relayer (deployer) | `rewards.claimBatch` | 573,712 | `0xdb84e8e1ab46c23180782dd06d6e51ab4cd79e5d689b97a551471a992b98279e` |
| 40 | day 7: 2 visits (Hunt cache, Marisol's meeting point) in ONE batched claim | EmpowerTours/Hunt relayer (deployer) | `rewards.claimBatch` | 611,396 | `0x5a73dbf1204f5fa479b6723cb7894e73802171930edaed4e8aca071fea0f13a8` |
| 41 | day 8: 3 visits (Hunt cache, Marisol's meeting point, Foro Lumbre Oaxaca) in ONE batched claim | EmpowerTours/Hunt relayer (deployer) | `rewards.claimBatch` | 645,133 | `0xa9018c689078111b3b82e5c434a4babe934bb724b8b6aca67a513b5112835be1` |
| 42 | day 9: 2 visits (Hunt cache, Lumbre mural) in ONE batched claim | EmpowerTours/Hunt relayer (deployer) | `rewards.claimBatch` | 592,561 | `0xf17f0c30b1a453d60b6f8247ff36f727d7e43b9dd5877a5407795b2f8e2c4d11` |
| 43 | day 10: 2 visits (Hunt cache, Marisol's meeting point) in ONE batched claim | EmpowerTours/Hunt relayer (deployer) | `rewards.claimBatch` | 573,686 | `0x04938d05aaf0ec2c2fe2beb2f68f438d229b97aa3fbeb8593d032c7cd55148c4` |
| 44 | day 11: 2 visits (Hunt cache, Marisol's meeting point) in ONE batched claim | EmpowerTours/Hunt relayer (deployer) | `rewards.claimBatch` | 576,790 | `0x975d9c723a5b943c7b908c514597e17818010643404283715d1e72b34a2497b3` |
| 45 | day 12: 3 visits (Hunt cache, Lumbre mural, Foro Lumbre Oaxaca) in ONE batched claim | EmpowerTours/Hunt relayer (deployer) | `rewards.claimBatch` | 626,311 | `0x4ffd4aaf69ec04052585ca4a3726d89432d51f5472edab016278c5e41130a838` |

## 3. Yield accrues; Ana and Luis back an artist; Ana redeems a perk with $TOURS

| # | Action | From | Call | Gas | Tx hash |
|---|---|---|---|---|---|
| 46 | DEMO ONLY: mock lending pool simulates 30 days of 5% APR (Solonet cannot warp time) | EmpowerTours/Hunt relayer (deployer) | `pool.fastForward` | 60,678 | `0xa4f0c7e21ce21e6c5d2af945fc2fd2da22b085272133adc6a40f3171ab132c8f` |
| 47 | Lumbre opens a fan-backed tour fund (leash: Foro Oaxaca ≤100, Foro CDMX ≤150) | Lumbre (artist) | `factory.createVault` | 652,933 | `0x037737d42484d27f0656d2b3d30b21d798caf3c027e146cb72130cac45043600` |
| 48 | Lumbre approves 200 USDC | Lumbre (artist) | `usdc.approve` | 57,311 | `0x6bf8920846323e004de728c113013d81f2167b2ba83f73988ee743e0468e05ba` |
| 49 | Lumbre puts 200 USDC of her own into the tour fund | Lumbre (artist) | `TripVault(artist).deposit` | 458,246 | `0x0ef767412152827999ae075ccc7df8d73bae760a4a3a1cc1e63c72d2df0c9878` |
| 50 | Luis approves 40 USDC | Luis (friend) | `usdc.approve` | 57,311 | `0x980fb09a4101c75c602e56b0d6c4cc10e903f47bb5dde11f9c98558b84642a55` |
| 51 | Luis backs Lumbre's tour with 40 USDC (perks, not a revenue share) | Luis (friend) | `TripVault(artist).deposit` | 382,245 | `0xda38f39971b324f34bd929969bd618c097b3c40a8cbff791cc5cb0cbd1650093` |
| 52 | Ana approves 20 USDC | Ana (traveler) | `usdc.approve` | 57,311 | `0xa867a2f258b5c9ad3d5ce2b49b7d51193e277207a7900b16b89cd2fff8f3ee49` |
| 53 | Ana backs Lumbre's tour with 20 USDC | Ana (traveler) | `TripVault(artist).deposit` | 382,258 | `0x6f80d59d476b614d6d7b3dd477cb3a2df29cc80ec37981b4a528dcd4dbc35356` |
| 54 | Ana approves PerkMarket for 150 $TOURS | Ana (traveler) | `tours.approve` | 57,374 | `0xbefe86554aba00f61c9a2328aeac978b2cbaceb639657f1cf4b00ace051ac45b` |
| 55 | Ana redeems "Backstage pass · Lumbre live in Oaxaca" (150 $TOURS burned) | Ana (traveler) | `perks.redeem` | 238,002 | `0xc9485877096aa829e344c7b3d6f273aef4d780ccc9dfbce52ff618a797976cc5` |

## 4. Trip window opens: the vault books a guide and a stay through escrow

| # | Action | From | Call | Gas | Tx hash |
|---|---|---|---|---|---|
| 56 | vault books Mezcal & Monte Albán tour for 2 (90 USDC into escrow) | Ana (traveler) | `TripVault.book` | 665,599 | `0xe70a3c53a09bf35ff4c3574ca1df8470c7a90b390d5ef506336f14fdc1bbd730` |
| 57 | vault books 3 nights at Casa Azul (114 USDC into escrow) | Ana (traveler) | `TripVault.book` | 592,753 | `0x4fb716d915a9316b252498f69e8c169bdeb28d70e6a83a5750f569eddf9b5b11` |
| 58 | Casa Azul cancels → automatic full refund to the vault, leash allowance restored | Casa Azul (host) | `bookings.hostCancel` | 424,413 | `0x3447b4b7bec4366b4410e6309452bb113d7d7f861704deb16eff682afcea10e8` |
| 59 | vault re-books 3 nights at Casita Jalatlaco (126 USDC into escrow) | Ana (traveler) | `TripVault.book` | 573,756 | `0xf06bbe4f412837527959ef4199c34b3af27eaab875708c8d05fcae45acf181cb` |
| 60 | Marisol submits the Hunt GPS check-in proof → tour escrow released (3% fee to treasury) | Marisol (local guide) | `bookings.confirmWithAttestation` | 496,167 | `0x4ce4a802085cc6f1651c1125ae15b57e30f42713ffaa85d8b12752e8c26270b5` |
| 61 | Ana confirms check-in at Casita Jalatlaco → stay escrow released | Ana (traveler) | `TripVault.confirmCheckIn` | 512,883 | `0xadd9eeea0ab73bfe5f7ef096c62df9f2d07034f5d887ae9f3314189bd6eddb8d` |
| 62 | Ana anchors her tour review (rating 5 + keccak256 of the text) | Ana (traveler) | `bookings.anchorReview` | 135,933 | `0x5cc5b12df297db21c414ad99ebff09fd842e3bf81fcff20c6d435af6f3533969` |
| 63 | Ana anchors her stay review | Ana (traveler) | `bookings.anchorReview` | 135,946 | `0x10ba245a7e1ee1694cf4cadcc54ea7a33da1d965e0b14860138ec8c86b2efd0d` |

## 5. Lumbre's tour: venue bookings, ticket sales, a show and a cancellation

| # | Action | From | Call | Gas | Tx hash |
|---|---|---|---|---|---|
| 64 | tour fund books Foro Lumbre Oaxaca for tonight (50 USDC deposit into escrow, 70/30 split) | Lumbre (artist) | `TripVault(artist).bookVenue` | 819,886 | `0xe5c538f32bf63b768d46bcdd3da320cec449e33522aa47f1c17a56c5c9291d5f` |
| 65 | tour fund books Foro Indie CDMX for tomorrow (80 USDC flat fee into escrow) | Lumbre (artist) | `TripVault(artist).bookVenue` | 769,166 | `0x3e1a58ea2e5c99f20b650db958e7de222e5713e3a2466df0fb70e1131e87f256` |
| 66 | Ana (traveler) approves 12 USDC | Ana (traveler) | `usdc.approve` | 57,297 | `0x0720561e2f904248af48ba34586ea4da2a7727b71754257fbe9561d575895954` |
| 67 | Ana buys 1 ticket for Oaxaca (escrow) | Ana (traveler) | `tickets.buy` | 329,104 | `0xc846abf0cff2a5feae96fa8dcc025bd72589fd97c13483acf85188189e0022b5` |
| 68 | Ana (traveler) approves 15 USDC | Ana (traveler) | `usdc.approve` | 57,311 | `0xa72393c3e1ef937696bf59b800f85753183a43f78b2e10e834cbbd1741c8db80` |
| 69 | Ana buys 1 ticket for CDMX (escrow) | Ana (traveler) | `tickets.buy` | 316,492 | `0x601eb8e5ac6c76f8f54b5d7e65f227e72317886a0eb9c7a44fefaded72da7e83` |
| 70 | Luis (friend) approves 24 USDC | Luis (friend) | `usdc.approve` | 57,311 | `0x6e6e0c6c7c2e6a86e74c469c835e74d65938b4a846e2f8c6731ef90c6dccc2b1` |
| 71 | Luis buys 2 tickets for Oaxaca | Luis (friend) | `tickets.buy` | 376,103 | `0xd7f3e0732cce0ee88a29ce7ee566db63e8d8932b5e6cdf7d5df4e8f2ef7254c1` |
| 72 | Sofía (fan) approves 12 USDC | Sofía (fan) | `usdc.approve` | 57,297 | `0x9f7ea9f5a5849bda462b38bc9ac5cd62897f234db7ddf51bfc6969ae61969d27` |
| 73 | Sofía buys 1 ticket for Oaxaca | Sofía (fan) | `tickets.buy` | 297,314 | `0xb0a8de65d815cc32bb2350f8e098233fae4b0ea1b70e9dcd62f2ffe8b83acc55` |
| 74 | Sofía (fan) approves 30 USDC | Sofía (fan) | `usdc.approve` | 57,324 | `0x1a829052f8228032e24648d93a653792c8fdc2bb510b090c766e394015010774` |
| 75 | Sofía buys 2 tickets for CDMX | Sofía (fan) | `tickets.buy` | 357,282 | `0xbc882ddac3433c787f1be6d3d1d6fc0c6cac78fd772252e61920371cacb1f0f8` |
| 76 | Luis claims backing $TOURS (unlocked by the share of tour money actually spent) | Luis (friend) | `rewards.claimBacking` | 211,983 | `0x81df38fbf032e0695428af256ffb0d74ca4311e0418ee2e6685d486ea8a28b27` |
| 77 | Foro Oaxaca submits its door-QR check-in attestation → show Played, deposit released (3% fee) | Foro Lumbre Oaxaca (venue) | `venues.confirmShow` | 493,678 | `0x0260636254ab532b68dd1ad80883d160016ad85742e7c48e8bc917388aaa6417` |
| 78 | door scan: Ana (traveler)'s ticket #0 (check-in → $TOURS + streak) | EmpowerTours/Hunt relayer (deployer) | `tickets.scan` | 201,987 | `0xe51f6867e93cf1ff4c28133a1e58c072ea7a2cecfefebef81ed4a33ddf104211` |
| 79 | door scan: Luis (friend)'s ticket #2 (check-in → $TOURS + streak) | EmpowerTours/Hunt relayer (deployer) | `tickets.scan` | 220,156 | `0x68d9e7f4cb731ea38c1e2e9db0482bbc7a274076f533dbd83417e0c3c19b149d` |
| 80 | door scan: Luis (friend)'s ticket #3 (check-in → $TOURS + streak) | EmpowerTours/Hunt relayer (deployer) | `tickets.scan` | 198,224 | `0x446b2d39ba746e362bba1f2a4625b5ed89c4c318143435e1da50f1be536f5367` |
| 81 | door scan: Sofía (fan)'s ticket #4 (check-in → $TOURS + streak) | EmpowerTours/Hunt relayer (deployer) | `tickets.scan` | 239,004 | `0x16e38b08a79aa5a6a76c442081fa06a4012129d0666822a882d41b47784f19bd` |
| 82 | settle Oaxaca ticket escrow → 4% fee, venue 30%, Lumbre 70% | EmpowerTours/Hunt relayer (deployer) | `tickets.settle` | 213,065 | `0x56ab4658c92913b6958c00275d5b413b6273271cfabd545b0371b936e8034979` |
| 83 | Foro Indie CDMX cancels → Lumbre's tour fund refunded automatically (80 USDC), leash restored | Foro Indie CDMX (venue) | `venues.venueCancel` | 470,994 | `0x288bebc0ebb8ce38cc25178bdef8cb26e0fac9f8d8e81b509e593f186430adfe` |
| 84 | refund every CDMX ticket holder in one call (anyone can trigger) | EmpowerTours/Hunt relayer (deployer) | `tickets.refundAll` | 193,620 | `0x1ebd05310b2d67e1e59615d047a61d48c531c2eb13ee539f488c2e3e0a6015e8` |
