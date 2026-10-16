# Demo transcript: Oaxaca trip that saves itself while you play

Generated 2026-10-16T16:07:24.417Z on LOCAL Monad Solonet (chain 20143, http://localhost:8080). Mock USDC, test accounts. Nothing public.

Monad charges the gas **limit**, so every tx is sent with limit = estimate × 1.10; "gas used" below equals the limit charged.

## Outcome

- Trip vault `0x605ACEb49C4CBA86837dBa0C49B5f1ACB6F6Dc84`: **64.36% funded (321.81721 / 500 USDC incl. 254 already spent on bookings)**
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
- 110 transactions, 32,478,972 gas, 3.3129 MON at Solonet's 100 gwei base fee

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
| 4 | a check-in proof signed by the global Hunt key no longer releases a host escrow | Marisol (local guide) | `BadAttestation()` |
| 5 | tour fund books a venue that is not on the leash | Lumbre (artist) | `NotApprovedVendor(0x15d34AAf54267DB7D7c367839AAf71A00a2C6A65)` |
| 5 | fans try to buy CDMX tickets before the venue accepts the request | Sofía (fan) | `AwaitingApproval()` |
| 5 | door-scalping lock: after the first scan Sofía tries to pass her spare ticket to Marisol (holds none) | Sofía (fan) | `TransferLocked()` |
| 5 | scan Ana's ticket a second time | EmpowerTours/Hunt relayer (deployer) | `AlreadyUsed()` |
| 5 | the global Hunt key can no longer attest a show | Foro Lumbre Oaxaca (venue) | `BadAttestation()` |
| 5 | buy a ticket for the cancelled CDMX show | Sofía (fan) | `NotOnSale()` |
| 5b | Luis lists a ticket at 13.21 USDC (cap is 110% of 12 = 13.20) | Luis (friend) | `PriceAboveCap(13210000, 13200000)` |

## 0. Partners set up (sponsored stops, listings, perks)

| # | Action | From | Call | Gas | Tx hash |
|---|---|---|---|---|---|
| 1 | faucet 1,000 mock USDC to Ana (traveler) | Ana (traveler) | `usdc.faucet` | 70,128 | `0x93198f84637d1994eea82675a7476253c6f615e04d5dd248c61e1681bd6853c5` |
| 2 | faucet 1,000 mock USDC to Luis (friend) | Luis (friend) | `usdc.faucet` | 70,115 | `0x93d8df29ea44718620d65d64855b363e7ff0272973d8e19843be500753891fa6` |
| 3 | faucet 1,000 mock USDC to Marisol (local guide) | Marisol (local guide) | `usdc.faucet` | 70,128 | `0x983ff24911a32d41976d25091b8db8e6989124e63eedc25e9c05ba58b8a0ebfb` |
| 4 | faucet 1,000 mock USDC to Casita Jalatlaco (host) | Casita Jalatlaco (host) | `usdc.faucet` | 70,128 | `0xd4386e8fd6540afafd610be918562e28edc9f774164319655df9fff04d73e8ee` |
| 5 | faucet 1,000 mock USDC to Lumbre (artist) | Lumbre (artist) | `usdc.faucet` | 70,128 | `0x8365dcbf6a2de4e2d8b7de67bceb3bc7af573eae0c2acf2334d8663575c4c51c` |
| 6 | faucet 1,000 mock USDC to Foro Lumbre Oaxaca (venue) | Foro Lumbre Oaxaca (venue) | `usdc.faucet` | 70,115 | `0xfa2f10692d5d443629690ad9ed199cb32d7eb6a903aa61285f77565870017b02` |
| 7 | faucet 1,000 mock USDC to Foro Indie CDMX (venue) | Foro Indie CDMX (venue) | `usdc.faucet` | 70,128 | `0x57bb767791cae47c433d98fc872c3d9d07dd1f65387ca8cf1914d94c118535a1` |
| 8 | faucet 1,000 mock USDC to Sofía (fan) | Sofía (fan) | `usdc.faucet` | 70,128 | `0x39c4e6131e95b927d69a70cbafc399c9c971a16578e1680588ccc77fe4813eb2` |
| 9 | Casita Jalatlaco (host) approves campaign budget | Casita Jalatlaco (host) | `usdc.approve` | 57,311 | `0xb7a4761f872de2103d31d74fe761f0cca6196dcdecf918666a0217ceeb9421c0` |
| 10 | Casita Jalatlaco (host) sponsors stop "Hunt cache · Jardín Etnobotánico" (300 USDC, 10% platform fee) | Casita Jalatlaco (host) | `rewards.createCampaign` | 390,120 | `0x45154f43b1f6a4b67317501a1fdaa733f8ad3eaea7f054c9c0d797873619f905` |
| 11 | Marisol (local guide) approves campaign budget | Marisol (local guide) | `usdc.approve` | 57,311 | `0x47d9701bb9f4c2e765187a8182beeb7829efe358ee0953b5b112b29615000e64` |
| 12 | Marisol (local guide) sponsors stop "Marisol's meeting point · Santo Domingo" (200 USDC, 10% platform fee) | Marisol (local guide) | `rewards.createCampaign` | 314,806 | `0x3c4cdc0df16d86b91c64fe2879bf33518f23f877c3565fa8fe9be8822f75a43c` |
| 13 | Lumbre (artist) approves campaign budget | Lumbre (artist) | `usdc.approve` | 57,311 | `0x4aed33fd2f9a3e84d3c28a670d8f3a97b092642d72ff7be688a17d187cbbca68` |
| 14 | Lumbre (artist) sponsors stop "Lumbre mural · Calle Macedonio Alcalá" (100 USDC, 10% platform fee) | Lumbre (artist) | `rewards.createCampaign` | 314,792 | `0x990954edf2349ea56434776517e04fb477ef70614181691fbdb3b4743a165ffe` |
| 15 | Foro Lumbre Oaxaca (venue) approves campaign budget | Foro Lumbre Oaxaca (venue) | `usdc.approve` | 57,311 | `0xec16fd71a9f9503b6125e7f4572bc7dc6b9899cd05efe62818c48e4e112aee39` |
| 16 | Foro Lumbre Oaxaca (venue) sponsors stop "Foro Lumbre Oaxaca · patio murals" (80 USDC, 10% platform fee) | Foro Lumbre Oaxaca (venue) | `rewards.createCampaign` | 314,726 | `0xf377ef98708593a7676e6ecc5081882590b99c39e6f17ccaea67999b48cea7f7` |
| 17 | Foro Indie CDMX (venue) approves campaign budget | Foro Indie CDMX (venue) | `usdc.approve` | 57,311 | `0xaef042272bf7313b30f567b3449b102cbd27ece6ef1ddaf5317aa0d74ff1bd65` |
| 18 | Foro Indie CDMX (venue) sponsors stop "Foro Indie CDMX · Roma mural walk" (60 USDC, 10% platform fee) | Foro Indie CDMX (venue) | `rewards.createCampaign` | 314,726 | `0x4984c5b6c7c852fa66b6cc19e2d3b02639de7808d6ab6c9a39d73f36c32bb56a` |
| 19 | Marisol (local guide) lists "Mezcal & Monte Albán day tour" at 45 USDC | Marisol (local guide) | `bookings.createListing` | 223,485 | `0x3b21c81ca72d175d27013bcd8df53b3c7aee3116d946e2c6a410020895005a0f` |
| 20 | Casa Azul (host) lists "Casa Azul · garden room" at 38 USDC | Casa Azul (host) | `bookings.createListing` | 226,590 | `0x8ffbe71a8cdd4973926e701150785d9bab4d11d88c1f65265fa45610c53e3e36` |
| 21 | Casita Jalatlaco (host) lists "Casita Jalatlaco · whole casita" at 42 USDC | Casita Jalatlaco (host) | `bookings.createListing` | 257,778 | `0x08a4cb33a314fe467d2e66f8303c767c1e84e1a7c41b1cc3d7b4f91d85229722` |
| 22 | Luis (friend) lists "Random hostel (not on the leash)" at 25 USDC | Luis (friend) | `bookings.createListing` | 257,592 | `0x5e2f8d9a95ad1885a04e0ac264a9736c927a70e655141a3fedbd4cfaadec3db5` |
| 23 | Marisol (local guide) lists "Coyoacán & Frida walk" at 35 USDC | Marisol (local guide) | `bookings.createListing` | 207,662 | `0x2ba0a7701d15e49cb7586fac2343bc6c113dbe2cfa67b06b41e7952724d0b5f0` |
| 24 | Casa Roma (host) lists "Casa Roma · garden loft" at 55 USDC | Casa Roma (host) | `bookings.createListing` | 226,563 | `0x08cdfd3bed19ab712558c18f11a05d810c3f3aa26d492055b7dff628053fc956` |
| 25 | EmpowerTours approves Marisol as a perk partner | EmpowerTours/Hunt relayer (deployer) | `perks.setPartner` | 66,411 | `0xccd256ff64e6a5741c18e0a47c280330d4a0f347b26114cec4165a7b415b754a` |
| 26 | Lumbre lists perk "Backstage pass · Lumbre live in Oaxaca" for 150 $TOURS | Lumbre (artist) | `perks.listPerk` | 212,797 | `0xf6140cf0a502a8ade0592133fda217b6141831f0e74ca67207169a1b2ce29e43` |
| 27 | Marisol Tours lists perk "10% off the Mezcal & Monte Albán tour" for 60 $TOURS | Marisol (local guide) | `perks.listPerk` | 194,015 | `0x825f9de3250d174ab76ecb9f023177468a61842c4d08bd5c12869f1e26775ee3` |
| 28 | Foro Lumbre Oaxaca (venue) lists venue "Foro Lumbre Oaxaca" (70/30 ticket split, 50 USDC deposit, 20 cancel fee) | Foro Lumbre Oaxaca (venue) | `venues.listVenue` | 246,681 | `0xd330fe2618749bd7fa27bd843bf643f85088a5ada9b3738dc93b236a77474e0c` |
| 29 | Foro Lumbre Oaxaca opens its calendar (next 14 days) | Foro Lumbre Oaxaca (venue) | `venues.setOpenDates` | 494,477 | `0x361f56e8225e0eef3f80225788dc997ca762ba340a6cafa3e15fbdad95f0db18` |
| 30 | Foro Indie CDMX (venue) lists venue "Foro Indie CDMX" (flat fee 80 USDC, 30 cancel fee) | Foro Indie CDMX (venue) | `venues.listVenue` | 249,866 | `0x1fc2a7d88f3b96ba3b4c0da0b05ae17da4b43e7dcee50b9d06ec9947c7b646fd` |
| 31 | Foro Indie CDMX opens its calendar (next 14 days) | Foro Indie CDMX (venue) | `venues.setOpenDates` | 494,490 | `0x2df5e4e96edf27ad438e583b86cbc1025c0d9c5458c9b43826eaec6a3aca0f92` |
| 32 | Casa Azul (host) lists venue "Bar La Cantina (not on the leash)" (80/20) | Casa Azul (host) | `venues.listVenue` | 300,510 | `0xeb6a1b0a0d0204b0aaedf0359fa7a7e2124c65f0a0649616949b61fa98072f84` |
| 33 | Bar La Cantina (not on the leash) opens its calendar (next 14 days) | Casa Azul (host) | `venues.setOpenDates` | 494,490 | `0xc65c102ffd1dce20c6e0fed239c831456becbc072fef1d6e9cd674616efad024` |
| 34 | Foro Lumbre Oaxaca registers its door-scanner key | Foro Lumbre Oaxaca (venue) | `venues.setScanner` | 77,103 | `0x47425df1146a63a1a3da44e50f7bad53d85ba55df2bb38d7e2b99739af631515` |
| 35 | Foro Indie CDMX registers its door-scanner key | Foro Indie CDMX (venue) | `venues.setScanner` | 77,116 | `0x727b5d732ff1271fefe4785d21dd337ed94905fc15d19541a3b2563d0d544ee5` |
| 36 | Foro Indie CDMX turns on manual approval (bookings arrive as requests) | Foro Indie CDMX (venue) | `venues.setManualApproval` | 76,243 | `0xfb185704ef7aa390256e5b9d719c015d644c0aa78eb216b0303d65793f50ff50` |
| 37 | Marisol (local guide) registers its own phone as check-in scanner | Marisol (local guide) | `bookings.setScanner` | 58,122 | `0x5ceffee28c6d764d9a2656532a680bf7163ca905cb8aba1fbc06fedf7fe11341` |
| 38 | Casa Azul (host) registers its own phone as check-in scanner | Casa Azul (host) | `bookings.setScanner` | 58,122 | `0xd75848a99a14438f5577aa277dc8e471794499e4a9286cd214e5d0dbdec31e7a` |
| 39 | Casita Jalatlaco (host) registers its own phone as check-in scanner | Casita Jalatlaco (host) | `bookings.setScanner` | 58,122 | `0xbd2fa09703b189617c7ecd3eea21381588f32eda78ee4f02cfb9592f8caa9b6c` |
| 40 | Casa Roma (host) registers its own phone as check-in scanner | Casa Roma (host) | `bookings.setScanner` | 58,122 | `0xb35e2ffbef916b1904d8051b675cfbdd36939053e319117393a9eb568eae51bb` |

## 1. Ana opens an Oaxaca trip vault with a leash; Luis chips in

| # | Action | From | Call | Gas | Tx hash |
|---|---|---|---|---|---|
| 41 | Ana creates trip "Oaxaca, MX · March 2027", goal 500 USDC, leash: 3 vendors, total cap 450 | Ana (traveler) | `factory.createVault` | 756,407 | `0xbe9d24276b4eb081dbc2a2145c81e45f44d1cf142aac4793dfd0c25b2fe5eca6` |
| 42 | Ana approves 200 USDC | Ana (traveler) | `usdc.approve` | 57,311 | `0xb8e090505ad0f8f79e34893e2c098dd5b29d1e3968b92e5ba382436c4306edd7` |
| 43 | Ana saves 200 USDC (auto-supplied to the lending pool) | Ana (traveler) | `TripVault.deposit` | 477,243 | `0x42e79e93257a1a346d368612fae9d153805d486532176812e11d5c57e3c6bbb0` |
| 44 | Luis approves 100 USDC | Luis (friend) | `usdc.approve` | 57,311 | `0xaf7a0c81d251af3272522a2d61d092834e3cc97cc9084d83c26ad10ebfbd4bbb` |
| 45 | Luis chips in 100 USDC to Ana's trip | Luis (friend) | `TripVault.deposit` | 382,245 | `0x0e172fd040889c67ad28ec8a276c84377a2e936bc2f84e1bec84ab5fee8cdd81` |

## 2. Twelve days of proved visits (Hunt GPS attestation) → rewards straight into the trip

| # | Action | From | Call | Gas | Tx hash |
|---|---|---|---|---|---|
| 46 | day 1: 2 visits (Hunt cache, Marisol's meeting point) in ONE batched claim | EmpowerTours/Hunt relayer (deployer) | `rewards.claimBatch` | 689,201 | `0x31eb502e9837ba97f1843154c543ae37c7c53f362599d9a904396e4903cb21db` |
| 47 | day 2: 2 visits (Hunt cache, Marisol's meeting point) in ONE batched claim | EmpowerTours/Hunt relayer (deployer) | `rewards.claimBatch` | 573,712 | `0xbfa64e456839b5c07058d370768baa8c4affc97706a0350302838828acc42890` |
| 48 | day 3: 2 visits (Hunt cache, Lumbre mural) in ONE batched claim | EmpowerTours/Hunt relayer (deployer) | `rewards.claimBatch` | 595,665 | `0xf0353b57380a1514eb0e0e2275f2ce916ff153daf8f333824f33eb8c93515502` |
| 49 | day 4: 3 visits (Hunt cache, Marisol's meeting point, Foro Lumbre Oaxaca) in ONE batched claim | EmpowerTours/Hunt relayer (deployer) | `rewards.claimBatch` | 645,159 | `0x9c00c1e77669f958f60ddc6a458b4c4ee4e370280837d9d2d39d8173f5167680` |
| 50 | day 5: 2 visits (Hunt cache, Marisol's meeting point) in ONE batched claim | EmpowerTours/Hunt relayer (deployer) | `rewards.claimBatch` | 573,712 | `0xd44d82925019a70c1e6534558b3db905cd1d1864b6539d366a8466049a035c6e` |
| 51 | day 6: 2 visits (Hunt cache, Lumbre mural) in ONE batched claim | EmpowerTours/Hunt relayer (deployer) | `rewards.claimBatch` | 573,712 | `0xb1c0a71e08e3e60d131292aa3ae5f6f00f85213edb093522a8bfe7bf0eff99df` |
| 52 | day 7: 2 visits (Hunt cache, Marisol's meeting point) in ONE batched claim | EmpowerTours/Hunt relayer (deployer) | `rewards.claimBatch` | 614,513 | `0xf4942e38cfa8879692f743805aded04dec44d101fe77d62b663a5391aa4ecf99` |
| 53 | day 8: 3 visits (Hunt cache, Marisol's meeting point, Foro Lumbre Oaxaca) in ONE batched claim | EmpowerTours/Hunt relayer (deployer) | `rewards.claimBatch` | 648,264 | `0x4351cb0cc4a95fb7cbb71b3b3b268ee56e4177ed1ebd4085fad4746c4ce683bb` |
| 54 | day 9: 2 visits (Hunt cache, Lumbre mural) in ONE batched claim | EmpowerTours/Hunt relayer (deployer) | `rewards.claimBatch` | 592,561 | `0xcf73bad127a5981c89d835a7d0342459bd8c2a6b29aaec3e1273ad6a5a4fe1b5` |
| 55 | day 10: 2 visits (Hunt cache, Marisol's meeting point) in ONE batched claim | EmpowerTours/Hunt relayer (deployer) | `rewards.claimBatch` | 573,686 | `0x88055eef96b83b5c6f8a4f28cfdc126e2a7945f5b6723c1f487dd5ede768f7e1` |
| 56 | day 11: 2 visits (Hunt cache, Marisol's meeting point) in ONE batched claim | EmpowerTours/Hunt relayer (deployer) | `rewards.claimBatch` | 573,699 | `0x04c41b56e0f9d68edfc684529120c4c7723356f548c7fa1e02f51238288ef167` |
| 57 | day 12: 3 visits (Hunt cache, Lumbre mural, Foro Lumbre Oaxaca) in ONE batched claim | EmpowerTours/Hunt relayer (deployer) | `rewards.claimBatch` | 626,311 | `0x79dd37243bd633522b0a713742a176470cb0eacceecfd28de8a854a34600771c` |

## 3. Yield accrues; Ana and Luis back an artist; Ana redeems a perk with $TOURS

| # | Action | From | Call | Gas | Tx hash |
|---|---|---|---|---|---|
| 58 | DEMO ONLY: mock lending pool simulates 30 days of 5% APR (Solonet cannot warp time) | EmpowerTours/Hunt relayer (deployer) | `pool.fastForward` | 60,678 | `0x7227f951cc5a620feccb00c9909ff32fadc92634e0d53e5b79b3abecb69e83dc` |
| 59 | Lumbre opens a fan-backed tour fund (leash: Foro Oaxaca ≤100, Foro CDMX ≤150) | Lumbre (artist) | `factory.createVault` | 652,933 | `0xe3673e0713b2b9b9d1e02f23bf3ec6477a14257506e48092e318c4b11e29910f` |
| 60 | Lumbre approves 200 USDC | Lumbre (artist) | `usdc.approve` | 57,311 | `0x9ec2cb56e06dc7d61fe68141700dd1dbb231213c27e676f15b4c02d044101a57` |
| 61 | Lumbre puts 200 USDC of her own into the tour fund | Lumbre (artist) | `TripVault(artist).deposit` | 458,246 | `0x72abc33c92bdd5b4fa3d3e35c21ce55e7fa32b88502da48b00bf1f0f39241ea4` |
| 62 | Luis approves 40 USDC | Luis (friend) | `usdc.approve` | 57,311 | `0x9048ab499aafb53173945429111de72005f1402a7da976bba9231dd696283278` |
| 63 | Luis backs Lumbre's tour with 40 USDC (perks, not a revenue share) | Luis (friend) | `TripVault(artist).deposit` | 382,245 | `0x41c8ad6b1bc35e39e3a82a621ff8883e01dc954d002db259ddfdb332eea31d09` |
| 64 | Ana approves 20 USDC | Ana (traveler) | `usdc.approve` | 57,311 | `0x3a8c72474c704bdf7430e17f94a42284688ed1c607372d2a3de073a5f410dd97` |
| 65 | Ana backs Lumbre's tour with 20 USDC | Ana (traveler) | `TripVault(artist).deposit` | 382,258 | `0xf5bfde450f566dd16709360e3fcf7634b92aba33c0e7229eae878e59dc59d5c3` |
| 66 | Ana approves PerkMarket for 150 $TOURS | Ana (traveler) | `tours.approve` | 57,388 | `0xdc3c3d43ffbe4fa594a2b7f5231964d8d48003ff77f2051645bbbb7465f4a8a6` |
| 67 | Ana redeems "Backstage pass · Lumbre live in Oaxaca" (150 $TOURS burned) | Ana (traveler) | `perks.redeem` | 238,002 | `0xedb910fcc230be01c6472bec7ac138bc79a4433b9e8e3b6e539a21197065f527` |

## 4. Trip window opens: the vault books a guide and a stay through escrow

| # | Action | From | Call | Gas | Tx hash |
|---|---|---|---|---|---|
| 68 | vault books Mezcal & Monte Albán tour for 2 (90 USDC into escrow) | Ana (traveler) | `TripVault.book` | 665,648 | `0xecce0010209d200fa9470b01ed86f1dcd3ea745ef1753ccfc6cd67a0ef0d6584` |
| 69 | vault books 3 nights at Casa Azul (114 USDC into escrow) | Ana (traveler) | `TripVault.book` | 592,803 | `0xca4099576eac0c9649478572042428450ca0a54f4288607bc4918757cd2c3892` |
| 70 | Casa Azul cancels → automatic full refund to the vault, leash allowance restored | Casa Azul (host) | `bookings.hostCancel` | 433,551 | `0x878cb9ff23bba9cbf1bd26ce7a30eed0a26cbf5aea823284da436d843149effe` |
| 71 | vault re-books 3 nights at Casita Jalatlaco (126 USDC into escrow) | Ana (traveler) | `TripVault.book` | 573,806 | `0xb06c076a91c304cdd99b3f8c0aace90b59d9e8149cb1505353d17e4c48e96727` |
| 72 | Marisol accepts the booking | Marisol (local guide) | `bookings.acceptBooking` | 76,198 | `0xbbf27e38fadc1e05f9aad7223943813bf28514f42e23e8ccb8b20cb8619f94a6` |
| 73 | Marisol scans Ana in with her registered scanner → tour escrow released (3% fee to treasury) | Marisol (local guide) | `bookings.confirmWithAttestation` | 496,359 | `0x2aff7be5a6ace4c2bbb04fe002fb8926ad31eda80eef963e175d928ae7cee9ab` |
| 74 | Ana confirms check-in at Casita Jalatlaco → stay escrow released | Ana (traveler) | `TripVault.confirmCheckIn` | 512,883 | `0xef8a137f3284a77378fca9588be487e59390f9bb010f7f46660dbefca0ab9622` |
| 75 | Ana anchors her tour review (rating 5 + keccak256 of the text) | Ana (traveler) | `bookings.anchorReview` | 135,982 | `0xddd009ba373ca4d0382ce319cd7ad43a6036207366774ae595d64067b5a205f5` |
| 76 | Ana anchors her stay review | Ana (traveler) | `bookings.anchorReview` | 135,995 | `0x98c3dbbbde605fd5ad5a27edbbba057567b756a0866553f8b5f888399c8ee399` |

## 5. Lumbre's tour: venue bookings, ticket sales, a show and a cancellation

| # | Action | From | Call | Gas | Tx hash |
|---|---|---|---|---|---|
| 77 | tour fund books Foro Lumbre Oaxaca for tonight (50 USDC deposit into escrow, 70/30 split) | Lumbre (artist) | `TripVault(artist).bookVenue` | 829,302 | `0xa95196749d389b853453a1b77d386f39e7e4fcc98dd42d753057946a13df7a01` |
| 78 | tour fund books Foro Indie CDMX for tomorrow (80 USDC flat fee into escrow) | Lumbre (artist) | `TripVault(artist).bookVenue` | 811,679 | `0xbf9de642388f431a1e9b6f97ac7a3a983da9fff29c0b0842a90c6fa79f865d77` |
| 79 | Foro Indie CDMX accepts Lumbre's booking request → tickets go on sale | Foro Indie CDMX (venue) | `venues.acceptShow` | 57,028 | `0x726557d376bbe68cdf036be2922107322bcf4b7d557e6751176a7d0994f8e154` |
| 80 | Ana (traveler) approves 12 USDC | Ana (traveler) | `usdc.approve` | 57,297 | `0xeae50765d98d4ce407e30118ce526b9f7d9411c580ad2aef3bc0903dd43d06b0` |
| 81 | Ana buys 1 ticket for Oaxaca (escrow) | Ana (traveler) | `tickets.buy` | 371,223 | `0x3ce6b3fa2f5c43c54956a167e7f4388e1be25471acdf61757b78969f74e66a08` |
| 82 | Ana (traveler) approves 15 USDC | Ana (traveler) | `usdc.approve` | 57,311 | `0x3a3bf862ca7d06d6dba112af18303139ffe3446fdde53c19809c81b873b89e10` |
| 83 | Ana buys 1 ticket for CDMX (escrow) | Ana (traveler) | `tickets.buy` | 358,611 | `0x70806f29364c44491f7caccc5291d1da98e45339fe93028da0f983a457cab7f3` |
| 84 | Luis (friend) approves 24 USDC | Luis (friend) | `usdc.approve` | 57,311 | `0x46bc470ce2cf7b15f68e621a8aa86de626fc450419c3c26d4319258ea6e7eecf` |
| 85 | Luis buys 2 tickets for Oaxaca | Luis (friend) | `tickets.buy` | 418,190 | `0x1f3ae86436a5a6819e30bda95d7767d3646c4b121c5846d7b6c5013fca3cee00` |
| 86 | Sofía (fan) approves 24 USDC | Sofía (fan) | `usdc.approve` | 57,311 | `0xc2cde3c699feb3992f5f8735f3de9be4dcd55c67fc2a512b85a06be981103836` |
| 87 | Sofía buys 2 tickets for Oaxaca | Sofía (fan) | `tickets.buy` | 418,190 | `0x3e94128e6bf6da0ab6f22cf195384172a138d77dd45466cbe1b816a387d67712` |
| 88 | Sofía (fan) approves 30 USDC | Sofía (fan) | `usdc.approve` | 57,324 | `0x37c23b8dc89978f2b3187ac8247931bc76a050c39c378a010948ac0d3cc9e307` |
| 89 | Sofía buys 2 tickets for CDMX | Sofía (fan) | `tickets.buy` | 399,368 | `0x22f4d6b54ab1b5d794bce9750361e6e7780e40c0516cc089247b96970ba78e28` |
| 90 | Luis claims backing $TOURS (unlocked by the share of tour money actually spent) | Luis (friend) | `rewards.claimBacking` | 211,983 | `0xdf43ac80e20b453b381861199da876794685844c2ba70dafd183535438c3471f` |
| 91 | door scan: Ana (traveler)'s ticket #0 (check-in → $TOURS + streak) | EmpowerTours/Hunt relayer (deployer) | `tickets.scan` | 244,622 | `0x51c5887cbb40f915bbbaf5ad364dbfcd37c662fdd144c4912a64b0383913ddb3` |
| 92 | door scan: Luis (friend)'s ticket #2 (check-in → $TOURS + streak) | EmpowerTours/Hunt relayer (deployer) | `tickets.scan` | 240,825 | `0x116a32f49e418802968d30310c4508b8d055aefa857b321688469408fa782628` |
| 93 | door scan: Luis (friend)'s ticket #3 (check-in → $TOURS + streak) | EmpowerTours/Hunt relayer (deployer) | `tickets.scan` | 218,880 | `0xacdb2c952e79eacf66964aa7549b33f734f4631b7220529f95bbee14ed659bbd` |
| 94 | door scan: Sofía (fan)'s ticket #4 (check-in → $TOURS + streak) | EmpowerTours/Hunt relayer (deployer) | `tickets.scan` | 259,673 | `0x2bbab41eefe48063ab8e503acc0a08924eb67327000a7de40abce8d0732b523b` |
| 95 | Sofía passes her spare ticket to Luis (already a holder → allowed) | Sofía (fan) | `tickets.transferTicket` | 168,942 | `0xa5668519be832563da539a30273da4aef37d6ad4e1467ffb36c46eff889d78e5` |
| 96 | Foro Oaxaca submits its door-QR check-in attestation → show Played, deposit released (3% fee) | Foro Lumbre Oaxaca (venue) | `venues.confirmShow` | 503,257 | `0x9a08d09047161bfe7af427065e094ff1036463b0ffa08f974143ba8583e7aca8` |
| 97 | settle Oaxaca ticket escrow → 4% fee, venue 30%, Lumbre 70% | EmpowerTours/Hunt relayer (deployer) | `tickets.settle` | 213,262 | `0xf74713c23c71d544cb6f419a3dbf240c82987e368237c9db3c8f3dd42c2af094` |
| 98 | Foro Indie CDMX cancels → Lumbre's tour fund refunded automatically (80 USDC), leash restored | Foro Indie CDMX (venue) | `venues.venueCancel` | 480,276 | `0x901fa4e1bd1b787ad3e25f38988acbf4fd35eb81ebfadbbc7b4c5df011c5203d` |
| 99 | refund every CDMX ticket holder in one call (anyone can trigger) | EmpowerTours/Hunt relayer (deployer) | `tickets.refundAll` | 194,012 | `0x25d7bdf7d37301028e06f150f1b9f414205047dc32afd5ae449c9c3ac4cab893` |

## 5b. Resale (≤110% of face, artist royalty, EmpowerTours fee), the door lock, and open requests for the UI

| # | Action | From | Call | Gas | Tx hash |
|---|---|---|---|---|---|
| 100 | tour fund books Foro Lumbre Oaxaca again in 3 days (50 USDC deposit) | Lumbre (artist) | `TripVault(artist).bookVenue` | 703,289 | `0xf5dcb419de68084c8850083162d48f1c2a1f50830c8543a871afc7e978d35c1a` |
| 101 | Luis (friend) approves 24 USDC | Luis (friend) | `usdc.approve` | 57,311 | `0x3f694439f2790fcd8f3997b391335c45fa247fa6372dca0d0ff0cbadd3502b99` |
| 102 | Luis buys 2 tickets for Oaxaca night 2 | Luis (friend) | `tickets.buy` | 456,201 | `0x143fc2e45c83f3b6b37afe2c9abf75f7ebcf27f1871150c132180670704acaf0` |
| 103 | Sofía (fan) approves 12 USDC | Sofía (fan) | `usdc.approve` | 57,297 | `0x53c783e650967b5acab21366d1e0a6fc799266c16bf3b930b0c83841f2c5f72b` |
| 104 | Sofía buys 1 ticket for Oaxaca night 2 | Sofía (fan) | `tickets.buy` | 320,599 | `0xa22330cba09331bfe1b894d5469eb15361b95d679e1b75ffe6867c32acb0f281` |
| 105 | Luis lists ticket at 13.20 USDC (110% of face) | Luis (friend) | `tickets.listForResale` | 109,661 | `0xb8509ad444f3ddae4d0068dcfd1f12aa818abdd485c3638e3c12621ae5b6ae5b` |
| 106 | Ana approves 13.20 USDC | Ana (traveler) | `usdc.approve` | 57,311 | `0x9af69ec326f4f53c2ced164e9cc1de9eeaf6b8612d72ed397d7a4ebac64e424d` |
| 107 | Ana buys Luis's resale ticket → 4% fee, 5% royalty to Lumbre, rest to Luis | Ana (traveler) | `tickets.buyResale` | 315,718 | `0x596123ead5741d0ef532753e86c65b4e0562a0a9768d31be082fee3ab60c825b` |
| 108 | Luis lists his second ticket at 12.60 USDC (left open for the UI) | Luis (friend) | `tickets.listForResale` | 109,661 | `0xa578ea57f20c5e56c5fbb915d3417724bc2eda86ebe6f9388541f90a95b49b56` |
| 109 | tour fund requests Foro Indie CDMX in 5 days (80 USDC deposit; waits for the venue) | Lumbre (artist) | `TripVault(artist).bookVenue` | 824,550 | `0x0730a4236e6d011094ef5a2ee6ea9e60dc8801496b124b9eb9e690bc8a924bdc` |
| 110 | vault books 1 night at Casa Azul (38 USDC; left for the host to accept in the UI) | Ana (traveler) | `TripVault.book` | 630,797 | `0x565c2749fe576387361f33d0ede19e379015b1736a330efaa01a72d593addcd0` |

## 6b. In the UI: real transactions from a Mera passkey wallet and DEV test accounts (`demo/ui-flows.mjs` → `demo/ui-flows.json`)

Headless Chromium on http://localhost with the CDP virtual authenticator (PRF extension on), so the Mera passkey ceremony, PRF → key derivation and in-page signing are the real code paths. Gas is from the confirmation toast (= the receipt).

| Step | Result | Gas |
|---|---|---:|
| [en] create passkey wallet | confirmed · 0x6c1a4ff29a9cB4E11a39c0e6aD6F143816cA1013 | — |
| [en] sign back in (same address) | confirmed · 0x6c1a4ff29a9cB4E11a39c0e6aD6F143816cA1013 | — |
| [en] private note sealed with the second PRF secret | confirmed | — |
| [en] passkey wallet: get 1,000 test USDC (devnet gas drip first) | confirmed | 70,128 |
| [en] passkey wallet: buy a ticket for Oaxaca night 2 | confirmed | 339,447 |
| [en] passkey wallet: list the ticket for resale at 110% of face | confirmed | 109,661 |
| [es] create passkey wallet | confirmed · 0xd1Fb4e87187a775281c5218d11FD464a8Cc6aaDd | — |
| [es] sign back in (same address) | confirmed · 0xd1Fb4e87187a775281c5218d11FD464a8Cc6aaDd | — |
| [es] private note sealed with the second PRF secret | confirmed | — |
| [es] passkey wallet: get 1,000 test USDC (devnet gas drip first) | confirmed | 70,128 |
| [es] passkey wallet: buy a ticket for Oaxaca night 2 | confirmed | 339,447 |
| [es] passkey wallet: list the ticket for resale at 110% of face | confirmed | 109,661 |
| DEV Foro Indie CDMX: accept Lumbre's booking request | confirmed | 57,028 |
| DEV Casa Azul: accept Ana's booking | confirmed | 76,211 |
| DEV Casa Azul: scan Ana in → escrow released | confirmed | 496,372 |
| DEV Ana: contribute 25 USDC to the trip vault | confirmed | 271,166 |
| DEV Ana: check in at a stop (local Hunt attester, claimBatch) | confirmed | 520,441 |
| DEV Sofía: buy Luis's resale ticket (fee + royalty + seller) | confirmed | 278,021 |
| DEV Ana: redeem a perk with $TOURS points | confirmed | 228,320 |
