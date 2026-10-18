# Rumbo by EmpowerTours · demo transcript: an Oaxaca trip that saves itself while you play

Generated 2026-10-18T01:52:01.979Z on LOCAL Monad Solonet (chain 20143, http://localhost:8080). Mock USDC, test accounts. Nothing public.

Monad charges the gas **limit**, so every tx is sent with limit = estimate × 1.10; "gas used" below equals the limit charged.

## Outcome

- Trip vault `0x4E230051A9a65a4aB3414A43f5e8c7993bDE6bA9`: **64.36% funded (321.817212 / 500 USDC incl. 254 already spent on bookings)**
- Vault balance now 67.817212 USDC; principal 320.5; yield earned 1.317212 USDC (mock pool, 30 simulated days)
- Streak: **13 days** (best 13); 27 proved visits
- $TOURS: Ana 296 earned → 176 after a 150 perk (burned); Luis 40 from backing; supply 226
- Treasury revenue: 84.908 USDC (sponsor fees 74 + booking fees 6.48)
- Check-ins: 27 visits in **12 batched claims** (one per day) + Ana's show ticket scan → streak 13
- Oaxaca show: 5 tickets, gross 60 USDC → Lumbre 40.32, Foro Oaxaca 17.28, fee 2.4; venue deposit released 48.5
- CDMX show: venue cancelled → 80 USDC back to Lumbre's tour fund, 3 tickets (45 USDC) refunded; escrows now tickets 36 / venues 130
- Venue reliability: Oaxaca 1 held / 0 cancelled; CDMX 0 / 1
- Treasury fee breakdown: sponsor 74 + bookings 6.48 + venue deposits 1.5 + tickets 2.928
- Casa Azul cancellation: refunded automatically; Ana's leash allowance for that host back to 38 USDC spent
- 110 transactions, 32,488,075 gas, 3.3138 MON at Solonet's 100 gwei base fee

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
| 1 | faucet 1,000 mock USDC to Ana (traveler) | Ana (traveler) | `usdc.faucet` | 70,128 | `0x039ea899cc3751f8f8ee304469fd6a7deb09cb72f463ede80b880a7e7c130d30` |
| 2 | faucet 1,000 mock USDC to Luis (friend) | Luis (friend) | `usdc.faucet` | 70,115 | `0xe7c37e602ee44390a1029704d8b034d6ad4c4cf84c3836793aa1d47ed5d0fd60` |
| 3 | faucet 1,000 mock USDC to Marisol (local guide) | Marisol (local guide) | `usdc.faucet` | 70,128 | `0xf9270903d2486abffc7c216f3325634e3b1ff39a00db46686165cb8513b5fd59` |
| 4 | faucet 1,000 mock USDC to Casita Jalatlaco (host) | Casita Jalatlaco (host) | `usdc.faucet` | 70,128 | `0x3ca125240083308867a8962d3b7f10e105d30563bdfcc64dee4fd1cb5d9fcab7` |
| 5 | faucet 1,000 mock USDC to Lumbre (artist) | Lumbre (artist) | `usdc.faucet` | 70,128 | `0x0cb33dc1af6623e5aab1c41be5b9a97635a765a56b774310c6ba56bf7b85886d` |
| 6 | faucet 1,000 mock USDC to Foro Lumbre Oaxaca (venue) | Foro Lumbre Oaxaca (venue) | `usdc.faucet` | 70,115 | `0x64cf7e78757fe1504502ac2802508ab527108c4214dceb2b085497c031566944` |
| 7 | faucet 1,000 mock USDC to Foro Indie CDMX (venue) | Foro Indie CDMX (venue) | `usdc.faucet` | 70,128 | `0x9c3082ba6eebe7c63662b4bd884094585370262cb3aef6bdef7cf532354fa327` |
| 8 | faucet 1,000 mock USDC to Sofía (fan) | Sofía (fan) | `usdc.faucet` | 70,128 | `0x5c04008269399be8e46fe38665af08943783da25d00308172ebf21e402e55f04` |
| 9 | Casita Jalatlaco (host) approves campaign budget | Casita Jalatlaco (host) | `usdc.approve` | 57,311 | `0x381ad9a5cf12900e01b52abdb793e2231c9287b9f7d02283c3f27947636e1a03` |
| 10 | Casita Jalatlaco (host) sponsors stop "Hunt cache · Jardín Etnobotánico" (300 USDC, 10% platform fee) | Casita Jalatlaco (host) | `rewards.createCampaign` | 390,120 | `0xf3027b598b47c33ccfcdc32ccdeda39bd6a70f4ab7b59ef76293fbc5442d25b2` |
| 11 | Marisol (local guide) approves campaign budget | Marisol (local guide) | `usdc.approve` | 57,311 | `0x258c971e755ff1ce579502bb82a286fc23ad5a5afa989058f4ffc5d29ed0bce6` |
| 12 | Marisol (local guide) sponsors stop "Marisol's meeting point · Santo Domingo" (200 USDC, 10% platform fee) | Marisol (local guide) | `rewards.createCampaign` | 314,806 | `0xe65788bc664b4606f38dca220e55b09d60b8a92919fd87cd0e3cb6826c7e2836` |
| 13 | Lumbre (artist) approves campaign budget | Lumbre (artist) | `usdc.approve` | 57,311 | `0x88ac3f711aad4b86529ae6d665c5a914189fc27b394c2d85c58010fd40391f92` |
| 14 | Lumbre (artist) sponsors stop "Lumbre mural · Calle Macedonio Alcalá" (100 USDC, 10% platform fee) | Lumbre (artist) | `rewards.createCampaign` | 314,792 | `0x4d136ef8423ca0ba9a815e4b0be9e3f59be3963a047d9d42e485f501e69c1caa` |
| 15 | Foro Lumbre Oaxaca (venue) approves campaign budget | Foro Lumbre Oaxaca (venue) | `usdc.approve` | 57,311 | `0x00cd65413fd93301c2890e18e71d574e7cb53895026b373d0233a39c7357b334` |
| 16 | Foro Lumbre Oaxaca (venue) sponsors stop "Foro Lumbre Oaxaca · patio murals" (80 USDC, 10% platform fee) | Foro Lumbre Oaxaca (venue) | `rewards.createCampaign` | 314,726 | `0x4b59f9a6eed3a9410f83d10dfda3698969cb1e5724a94f77b89e6f9966d1fcd7` |
| 17 | Foro Indie CDMX (venue) approves campaign budget | Foro Indie CDMX (venue) | `usdc.approve` | 57,311 | `0x1d19708692f4b66d7dfd0d7db3900b9f55b13774d9f42803ae573ec72c920ec5` |
| 18 | Foro Indie CDMX (venue) sponsors stop "Foro Indie CDMX · Roma mural walk" (60 USDC, 10% platform fee) | Foro Indie CDMX (venue) | `rewards.createCampaign` | 314,726 | `0x0fc6ff9561138764fa1b47764c0ca40676a03a7a56b60662d9a2afd76ddcc93c` |
| 19 | Marisol (local guide) lists "Mezcal & Monte Albán day tour" at 45 USDC | Marisol (local guide) | `bookings.createListing` | 224,060 | `0xef7358f5056f140f4298480bcf6b998f5ced06ff867067ca4c3c94430193fe80` |
| 20 | Casa Azul (host) lists "Casa Azul · garden room" at 38 USDC | Casa Azul (host) | `bookings.createListing` | 227,164 | `0xe68df799819c779aa7a1a66911722729a14b25fed7f5a87e84c81fb7e2091945` |
| 21 | Casita Jalatlaco (host) lists "Casita Jalatlaco · whole casita" at 42 USDC | Casita Jalatlaco (host) | `bookings.createListing` | 258,333 | `0x85ac76fca74b3f101947f20d577004b16ebe3db0eec5ccc7db0101731a893dd9` |
| 22 | Luis (friend) lists "Random hostel (not on the leash)" at 25 USDC | Luis (friend) | `bookings.createListing` | 258,148 | `0x6e3ae32e38288f03bb83365c91a3b5e06dfe99b0d4089470f6a4e8227648d59f` |
| 23 | Marisol (local guide) lists "Coyoacán & Frida walk" at 35 USDC | Marisol (local guide) | `bookings.createListing` | 208,236 | `0x8c34e2a0b7e5bcfce115517d94b7d2e0e9dbf763b5ed22f7559aec242f5c570d` |
| 24 | Casa Roma (host) lists "Casa Roma · garden loft" at 55 USDC | Casa Roma (host) | `bookings.createListing` | 227,137 | `0xfe98f80a67fffcc169c8e65bda8bfeefc581441d7b0628cf7ce1668a8c91bc48` |
| 25 | EmpowerTours approves Marisol as a perk partner | EmpowerTours admin (deployer) | `perks.setPartner` | 66,411 | `0x1efefbb04343098d9d3e3d93fcfd0ebcde52ef7fa6c6b629a60c7dcad7bd7069` |
| 26 | Lumbre lists perk "Backstage pass · Lumbre live in Oaxaca" for 150 $TOURS | Lumbre (artist) | `perks.listPerk` | 212,797 | `0xd43a9235d937a5e8fc3449e86a816ec2fc156c9cc2da8cb6338bdb9c94368f30` |
| 27 | Marisol Tours lists perk "10% off the Mezcal & Monte Albán tour" for 60 $TOURS | Marisol (local guide) | `perks.listPerk` | 194,015 | `0xf30e14993aeb87921906868aff3cf7f21dbe91451803bf985d789ba4487e8e11` |
| 28 | Foro Lumbre Oaxaca (venue) lists venue "Foro Lumbre Oaxaca" (70/30 ticket split, 50 USDC deposit, 20 cancel fee) | Foro Lumbre Oaxaca (venue) | `venues.listVenue` | 246,730 | `0xbd82e62ba35187c64477f7231c6d88631056006828cb87f7206f466f32fbbc5f` |
| 29 | Foro Lumbre Oaxaca opens its calendar (next 14 days) | Foro Lumbre Oaxaca (venue) | `venues.setOpenDates` | 494,623 | `0xb7f568413d1437a1eb2a773803365d393f88adf36a74d59eef6121a3f6f8afc0` |
| 30 | Foro Indie CDMX (venue) lists venue "Foro Indie CDMX" (flat fee 80 USDC, 30 cancel fee) | Foro Indie CDMX (venue) | `venues.listVenue` | 249,914 | `0x210bcb330567c5caf7aa3d4aadf677f6036f2d17443c79c8ff7649ab762b57d7` |
| 31 | Foro Indie CDMX opens its calendar (next 14 days) | Foro Indie CDMX (venue) | `venues.setOpenDates` | 494,637 | `0xebe1eb42284076fe07bd206a7a089ef0b2c46852d22da13d6ab092faa0b9abdc` |
| 32 | Casa Azul (host) lists venue "Bar La Cantina (not on the leash)" (80/20) | Casa Azul (host) | `venues.listVenue` | 300,531 | `0x7f70ea5a565460c72ac62c5ffb5ea2ff49336bf4d57543e44ee7dffeb1f18fe2` |
| 33 | Bar La Cantina (not on the leash) opens its calendar (next 14 days) | Casa Azul (host) | `venues.setOpenDates` | 494,637 | `0x2bacb5b127e29bc9bfd9e332d8b9b480028394f3cbaa4fb65c5758b9c28ea3ac` |
| 34 | Foro Lumbre Oaxaca registers its door-scanner key | Foro Lumbre Oaxaca (venue) | `venues.setScanner` | 77,200 | `0xe1918be8bd502a159b5af61be6aeaba8f81facaa1a17f1b7188683b77b551785` |
| 35 | Foro Indie CDMX registers its door-scanner key | Foro Indie CDMX (venue) | `venues.setScanner` | 77,213 | `0x8e2e8a2f7a528c1d3f381b2984d9f5c5eff57bbb402bfc4de1f2e856a8f2bda1` |
| 36 | Foro Indie CDMX turns on manual approval (bookings arrive as requests) | Foro Indie CDMX (venue) | `venues.setManualApproval` | 76,388 | `0xf81f9ff445e32330b4f56f40c55e711eacb02ee67caf3c0c6f44451117922901` |
| 37 | Marisol (local guide) registers its own phone as check-in scanner | Marisol (local guide) | `bookings.setScanner` | 58,196 | `0x56fad34f1ca0278e79e0d2f4824211a646b45a286235a4e08276b85cbe505cf0` |
| 38 | Casa Azul (host) registers its own phone as check-in scanner | Casa Azul (host) | `bookings.setScanner` | 58,196 | `0xb87c13a305d93e94b2db417a5297a1ac46679d199397c6f81f1cc22a66ccce30` |
| 39 | Casita Jalatlaco (host) registers its own phone as check-in scanner | Casita Jalatlaco (host) | `bookings.setScanner` | 58,196 | `0x333f80466648bca0fc3233ba26deb3c63f81c2412dc93bad7f609615b3e77666` |
| 40 | Casa Roma (host) registers its own phone as check-in scanner | Casa Roma (host) | `bookings.setScanner` | 58,196 | `0xbfd9815882662e9ea95b5968b599d4c502475f382cd8d390a824172c076f6bbb` |

## 1. Ana opens an Oaxaca trip vault with a leash; Luis chips in

| # | Action | From | Call | Gas | Tx hash |
|---|---|---|---|---|---|
| 41 | Ana creates trip "Oaxaca, MX · March 2027", goal 500 USDC, leash: 3 vendors, total cap 450 | Ana (traveler) | `factory.createVault` | 756,407 | `0xde61c80c08d1cd1c32f42dfa0b8da03bdfe81e4092982923d8cb368d593ff796` |
| 42 | Ana approves 200 USDC | Ana (traveler) | `usdc.approve` | 57,297 | `0x7c59654e9e67939b0a6d4f5f7b8c8d484ea5562fd65a994066d6614f00641627` |
| 43 | Ana saves 200 USDC (auto-supplied to the lending pool) | Ana (traveler) | `TripVault.deposit` | 477,243 | `0xd90226f2b36e4710f601502211b935fc3a142951da75a7f08f6bb6d5143b5199` |
| 44 | Luis approves 100 USDC | Luis (friend) | `usdc.approve` | 57,297 | `0xd59b6a22e2501d00a2c639e5a9b6f005448a33439538f8cc3a60ce0dc76bbb16` |
| 45 | Luis chips in 100 USDC to Ana's trip | Luis (friend) | `TripVault.deposit` | 382,245 | `0xc6a300e3e7aff1834dee32ac09ddce6ebd2ea690f28b781d2a5c48ec7f215a09` |

## 2. Twelve days of proved visits (Hunt GPS attestation) → rewards straight into the trip

| # | Action | From | Call | Gas | Tx hash |
|---|---|---|---|---|---|
| 46 | day 1: 2 visits (Hunt cache, Marisol's meeting point) in ONE batched claim (Ana submits it and pays her own gas) | Ana (traveler) | `rewards.claimBatch` | 689,174 | `0xfc9ab2f4c2442789dda0e3eb472fffbdeba20ee2fc2c1491216941e78edb9278` |
| 47 | day 2: 2 visits (Hunt cache, Marisol's meeting point) in ONE batched claim (Ana submits it and pays her own gas) | Ana (traveler) | `rewards.claimBatch` | 573,686 | `0xaf26bb75de19274f7a25a4aee0f6c798c65e04b1631db4e761e07e73168906db` |
| 48 | day 3: 2 visits (Hunt cache, Lumbre mural) in ONE batched claim (Ana submits it and pays her own gas) | Ana (traveler) | `rewards.claimBatch` | 592,548 | `0x4a1f54292a5853c0c2c81a58ef7035c16880a4d03e5a4d56f6aedb436ccbcd13` |
| 49 | day 4: 3 visits (Hunt cache, Marisol's meeting point, Foro Lumbre Oaxaca) in ONE batched claim (Ana submits it and pays her own gas) | Ana (traveler) | `rewards.claimBatch` | 648,250 | `0xca8e4154e306c4b3ba9edf72ef857667718f053dfeb0035c1419501acaeac354` |
| 50 | day 5: 2 visits (Hunt cache, Marisol's meeting point) in ONE batched claim (Ana submits it and pays her own gas) | Ana (traveler) | `rewards.claimBatch` | 611,396 | `0xa956a93b5c78f5433edcec10e4d4f6cc78b88285e480edc52717147135e765b4` |
| 51 | day 6: 2 visits (Hunt cache, Lumbre mural) in ONE batched claim (Ana submits it and pays her own gas) | Ana (traveler) | `rewards.claimBatch` | 592,548 | `0xc091ca82c57b8a707ccb9336e3f4de95dabbba045141e139fc19ba7f9615d3f0` |
| 52 | day 7: 2 visits (Hunt cache, Marisol's meeting point) in ONE batched claim (Ana submits it and pays her own gas) | Ana (traveler) | `rewards.claimBatch` | 573,699 | `0x25ffdbf136cd529fbc6491ee889e74ab9b1f7c6f25f05b5f13e1233b284ecf70` |
| 53 | day 8: 3 visits (Hunt cache, Marisol's meeting point, Foro Lumbre Oaxaca) in ONE batched claim (Ana submits it and pays her own gas) | Ana (traveler) | `rewards.claimBatch` | 648,211 | `0xbe3542ffaac3e9fb712cf8e292d4dabdc7c7e5399bba4d051e8c16414f1e346b` |
| 54 | day 9: 2 visits (Hunt cache, Lumbre mural) in ONE batched claim (Ana submits it and pays her own gas) | Ana (traveler) | `rewards.claimBatch` | 573,686 | `0x335a24df3b38818a834ac59eed0b31e2669e9c008ae57930977418316f58dd19` |
| 55 | day 10: 2 visits (Hunt cache, Marisol's meeting point) in ONE batched claim (Ana submits it and pays her own gas) | Ana (traveler) | `rewards.claimBatch` | 573,699 | `0x0e794536dcb8b0a199b54272a5c65ae802a5d8df6bbeb3dc233b8ef6fe944beb` |
| 56 | day 11: 2 visits (Hunt cache, Marisol's meeting point) in ONE batched claim (Ana submits it and pays her own gas) | Ana (traveler) | `rewards.claimBatch` | 573,699 | `0x1ddc1b807fcdb050b549e779ead854f6c199784447dc9c9f737300363d76ad5e` |
| 57 | day 12: 3 visits (Hunt cache, Lumbre mural, Foro Lumbre Oaxaca) in ONE batched claim (Ana submits it and pays her own gas) | Ana (traveler) | `rewards.claimBatch` | 629,376 | `0xf16d9f2a3eda27ae9ebc70f40f12f0c9f8d6647f181b537f5a583c1810d551cb` |

## 3. Yield accrues; Ana and Luis back an artist; Ana redeems a perk with $TOURS

| # | Action | From | Call | Gas | Tx hash |
|---|---|---|---|---|---|
| 58 | DEMO ONLY: mock lending pool simulates 30 days of 5% APR (Solonet cannot warp time) | EmpowerTours admin (deployer) | `pool.fastForward` | 60,678 | `0x678a5406e995360a4521f976e610041fb703e86c8b010d714088b131f88fd40a` |
| 59 | Lumbre opens a fan-backed tour fund (leash: Foro Oaxaca ≤100, Foro CDMX ≤150) | Lumbre (artist) | `factory.createVault` | 652,933 | `0xace134d5517a4908dc88fe0608d59672531b287c4c412cc7d1a0670de74cb17e` |
| 60 | Lumbre approves 200 USDC | Lumbre (artist) | `usdc.approve` | 57,297 | `0x6c30cb7a13360d28ec23b7bb314c6ae89e9b23a869f826a2ec0894db495ab0d3` |
| 61 | Lumbre puts 200 USDC of her own into the tour fund | Lumbre (artist) | `TripVault(artist).deposit` | 458,246 | `0xd2d0bbe9162c49c2cb76395789d9c0452ba3dceaa7554fcb3cba10a7fdae3638` |
| 62 | Luis approves 40 USDC | Luis (friend) | `usdc.approve` | 57,297 | `0x61e13161516f1ac81f2b1cfabefe4bd34af417fb17e591d6c3e9d551a1fba88e` |
| 63 | Luis backs Lumbre's tour with 40 USDC (perks, not a revenue share) | Luis (friend) | `TripVault(artist).deposit` | 382,245 | `0xf367da27443d8cb34662f673c0fd880c3fa3dbb999affc922e2623df5b0b9002` |
| 64 | Ana approves 20 USDC | Ana (traveler) | `usdc.approve` | 57,297 | `0x48a9d44ec97b7985c156b4e0ba3493500769c3ddadcd3c6f72ff7b319751f778` |
| 65 | Ana backs Lumbre's tour with 20 USDC | Ana (traveler) | `TripVault(artist).deposit` | 382,258 | `0x887e7f967bb87c78b76bd28daaf089222d433d9384c0a7ecdb02daf70b1942b7` |
| 66 | Ana approves PerkMarket for 150 $TOURS | Ana (traveler) | `tours.approve` | 57,388 | `0x49d301ebda6e93b24875741ceb1e7242f877a047fb57db43607e1089bf207dfc` |
| 67 | Ana redeems "Backstage pass · Lumbre live in Oaxaca" (150 $TOURS burned) | Ana (traveler) | `perks.redeem` | 238,002 | `0x08d5e6d98e1bd3b6d63d1d3a7f89d75813c65bc3a4f1636aff16ca208a8e1bd6` |

## 4. Trip window opens: the vault books a guide and a stay through escrow

| # | Action | From | Call | Gas | Tx hash |
|---|---|---|---|---|---|
| 68 | vault books Mezcal & Monte Albán tour for 2 (90 USDC into escrow) | Ana (traveler) | `TripVault.book` | 665,820 | `0x96e7da918bf128980b8637aa38b1dc05b56fec192108286ce5b605c3568b5970` |
| 69 | vault books 3 nights at Casa Azul (114 USDC into escrow) | Ana (traveler) | `TripVault.book` | 592,974 | `0x1e8d67e299a59810abab7929228440a4958edd96eb9e1f2f48ce39c162d314ea` |
| 70 | Casa Azul cancels → automatic full refund to the vault, leash allowance restored | Casa Azul (host) | `bookings.hostCancel` | 433,673 | `0x5a8d1eb66d5b178dbda31a5eb7e7b6520f522fecf17fcdda9850dda7b9ba169f` |
| 71 | vault re-books 3 nights at Casita Jalatlaco (126 USDC into escrow) | Ana (traveler) | `TripVault.book` | 573,978 | `0xa44e3ad48345438dd7e90ef142f13ba93e3c841030b8f7c79690c971eff46623` |
| 72 | Marisol accepts the booking | Marisol (local guide) | `bookings.acceptBooking` | 76,344 | `0x0a0da627b57fe9f850f46945ff74ee463f2c9a2ff6ecc5ef591df967da03ccce` |
| 73 | Marisol scans Ana in with her registered scanner → tour escrow released (3% fee to treasury) | Marisol (local guide) | `bookings.confirmWithAttestation` | 496,409 | `0x5dff3c9e3d1a532a2b0c0e3cf034e6483f5046fe504b467a0d0a80f81e4e0a22` |
| 74 | Ana confirms check-in at Casita Jalatlaco → stay escrow released | Ana (traveler) | `TripVault.confirmCheckIn` | 512,883 | `0xf3c3b1292b4ddfeb3a2a4e732c30999f2de879b04018aebdd920a36e190b4342` |
| 75 | Ana anchors her tour review (rating 5 + keccak256 of the text) | Ana (traveler) | `bookings.anchorReview` | 136,079 | `0x6f19250dc282725b45530798b7ed644af3400dff4568dd2b6fb57bb776e84263` |
| 76 | Ana anchors her stay review | Ana (traveler) | `bookings.anchorReview` | 136,093 | `0xfd10b78d022ebe36b61d2dc4d6a7527f8b4cc721db6743d0508689d578b8798e` |

## 5. Lumbre's tour: venue bookings, ticket sales, a show and a cancellation

| # | Action | From | Call | Gas | Tx hash |
|---|---|---|---|---|---|
| 77 | tour fund books Foro Lumbre Oaxaca for tonight (50 USDC deposit into escrow, 70/30 split) | Lumbre (artist) | `TripVault(artist).bookVenue` | 829,901 | `0x61e91c00f04d4f28698259a515173179213c0748e98d0f1b4308b057ae38b86a` |
| 78 | tour fund books Foro Indie CDMX for tomorrow (80 USDC flat fee into escrow) | Lumbre (artist) | `TripVault(artist).bookVenue` | 812,278 | `0x9c7a4258999fd9d9e85cfcc19fc72be9064309feb478c8039054e61fa82ecb03` |
| 79 | Foro Indie CDMX accepts Lumbre's booking request → tickets go on sale | Foro Indie CDMX (venue) | `venues.acceptShow` | 57,173 | `0x4eeb41f05d4cd52d2b867c697ddce12f0655eb1d530f9c9b1677678959259e3a` |
| 80 | Ana (traveler) approves 12 USDC | Ana (traveler) | `usdc.approve` | 57,297 | `0x7788b6996ce6fecaa58af335fa43c240908e9be19dd74d95597f6b597e1e04b9` |
| 81 | Ana buys 1 ticket for Oaxaca (escrow) | Ana (traveler) | `tickets.buy` | 371,273 | `0x5bbdf83f89909bb5ab110e3dc7cc5e6fffa159557f24215aaf4dee537868719e` |
| 82 | Ana (traveler) approves 15 USDC | Ana (traveler) | `usdc.approve` | 57,311 | `0x02a0a51eb2538a4a67709a33ea371236e0ceb87e15024e58c0b9b2b4e51525b8` |
| 83 | Ana buys 1 ticket for CDMX (escrow) | Ana (traveler) | `tickets.buy` | 358,659 | `0x3b90f021cf3b7624cdcb6a02b7d415577062c9b9e03ac10c7328e38aa2dcff01` |
| 84 | Luis (friend) approves 24 USDC | Luis (friend) | `usdc.approve` | 57,311 | `0x7a228e87ab1d7fb72207667e2bfd918df3202a8c3f1a7f1bf07dac88b408ac98` |
| 85 | Luis buys 2 tickets for Oaxaca | Luis (friend) | `tickets.buy` | 418,238 | `0x432c5355d0638e5728b84a4b5bbd3c97f1c6ddd30195d1bd0a5565529e1473b2` |
| 86 | Sofía (fan) approves 24 USDC | Sofía (fan) | `usdc.approve` | 57,311 | `0xd2579a1ec91cb4e607b5d5ae9101bef1fd7269028306defafa65233eeb390af7` |
| 87 | Sofía buys 2 tickets for Oaxaca | Sofía (fan) | `tickets.buy` | 418,238 | `0xadef87244a39df2055c7b3580b5a0b19d54b216c8d90703b894d30b48acfd9be` |
| 88 | Sofía (fan) approves 30 USDC | Sofía (fan) | `usdc.approve` | 57,324 | `0x80128444bdf4bf581e1a932cea60818f0b5e85281e103de69c15c79bb7b4f581` |
| 89 | Sofía buys 2 tickets for CDMX | Sofía (fan) | `tickets.buy` | 399,416 | `0xdf10a4167fd8e7742fec835240294ad99e70a597c90e03c53705462b3cfa80df` |
| 90 | Luis claims backing $TOURS (unlocked by the share of tour money actually spent) | Luis (friend) | `rewards.claimBacking` | 211,970 | `0x3778625db139fc649f19ac0537a54581b552740413ad95d7cc9c3834b80facd0` |
| 91 | door scan: Ana (traveler)'s ticket #0 (check-in → $TOURS + streak; venue submits, pays gas) | Foro Lumbre Oaxaca (venue) | `tickets.scan` | 244,744 | `0x56857aa112774c57df75450f77c7b335947d88453c980e34c547bf36f728fa84` |
| 92 | door scan: Luis (friend)'s ticket #2 (check-in → $TOURS + streak; venue submits, pays gas) | Foro Lumbre Oaxaca (venue) | `tickets.scan` | 240,947 | `0x8661c11f3871b7d224a4ef904c14ccbfe602ecb4e2633cfdb67a68bc9ce644b5` |
| 93 | door scan: Luis (friend)'s ticket #3 (check-in → $TOURS + streak; venue submits, pays gas) | Foro Lumbre Oaxaca (venue) | `tickets.scan` | 219,015 | `0x415e9555fe1b78aa9fdc15069d7afe296475fcf30abee6e1d18c2573ec21a478` |
| 94 | door scan: Sofía (fan)'s ticket #4 (check-in → $TOURS + streak; venue submits, pays gas) | Foro Lumbre Oaxaca (venue) | `tickets.scan` | 259,795 | `0x9e4e60e18c8362ea453ae595b0cbe56a6ebaa2497438e93ec1dc1cc1ac678e32` |
| 95 | Sofía passes her spare ticket to Luis (already a holder → allowed) | Sofía (fan) | `tickets.transferTicket` | 168,966 | `0xea130352ae33fc01aadd1742b9d5c5f33b597a50ffaeebaea74eb50e135eb08e` |
| 96 | Foro Oaxaca submits its door-QR check-in attestation → show Played, deposit released (3% fee) | Foro Lumbre Oaxaca (venue) | `venues.confirmShow` | 503,268 | `0xd764573adaa004d6aa437a2c4e3dfeef741a2d3125fc90033f56a95daef1e6d0` |
| 97 | settle Oaxaca ticket escrow → 4% fee, venue 30%, Lumbre 70% (Lumbre triggers it) | Lumbre (artist) | `tickets.settle` | 213,286 | `0x2a1e653be3ce47549a99bbc8613c34d8d926635a6ec7fc701e0af1a333bed7de` |
| 98 | Foro Indie CDMX cancels → Lumbre's tour fund refunded automatically (80 USDC), leash restored | Foro Indie CDMX (venue) | `venues.venueCancel` | 480,276 | `0x5102cc25a64551cf0689ffe50beafd524d4e193f74309943f50ead9f5d1117c6` |
| 99 | refund every CDMX ticket holder in one call (anyone can trigger; the venue does) | Foro Indie CDMX (venue) | `tickets.refundAll` | 194,110 | `0xa215ea0402f0aed08a5110ab4b3c592b8f8cf4a8514b8dda7fadd1f59edd1670` |

## 5b. Resale (≤110% of face, artist royalty, EmpowerTours fee), the door lock, and open requests for the UI

| # | Action | From | Call | Gas | Tx hash |
|---|---|---|---|---|---|
| 100 | tour fund books Foro Lumbre Oaxaca again in 3 days (50 USDC deposit) | Lumbre (artist) | `TripVault(artist).bookVenue` | 703,888 | `0x7d3d3e49b210c13e6ca878a8fe34447dd98c53cb19c66f167a694db01ed19a41` |
| 101 | Luis (friend) approves 24 USDC | Luis (friend) | `usdc.approve` | 57,311 | `0x41046950a4eab4b26f9ced34431f8642c8bba395f3996b90c6d855b888ed196f` |
| 102 | Luis buys 2 tickets for Oaxaca night 2 | Luis (friend) | `tickets.buy` | 456,250 | `0xa877cfb88cf7c7444eeebf55024dcd1776c7d3be17d77cd1c178baf3d2d9d48e` |
| 103 | Sofía (fan) approves 12 USDC | Sofía (fan) | `usdc.approve` | 57,297 | `0xfb7029c54c77f4c50518c7bf12fd38b36ea9705c62aad565e900e87db0286f9b` |
| 104 | Sofía buys 1 ticket for Oaxaca night 2 | Sofía (fan) | `tickets.buy` | 320,647 | `0x825d17bc4b70a02cf11d16eb4d49de6b96543b9227203b95fe29f7b0b3e816bd` |
| 105 | Luis lists ticket at 13.20 USDC (110% of face) | Luis (friend) | `tickets.listForResale` | 109,685 | `0x742c7f76dc73bfbaedee755ae7e72c3bcaa98a8f2602101a3227f9db2b10fd24` |
| 106 | Ana approves 13.20 USDC | Ana (traveler) | `usdc.approve` | 57,311 | `0xc15d579abcd67c0d4b9f61f5adf566424a0bb87b263b5da92a4733f804baf6e8` |
| 107 | Ana buys Luis's resale ticket → 4% fee, 5% royalty to Lumbre, rest to Luis | Ana (traveler) | `tickets.buyResale` | 315,767 | `0x08b8e2e88aca4341156fbcbd0f012042056da85b745be4e438c8df49e3c7a246` |
| 108 | Luis lists his second ticket at 12.60 USDC (left open for the UI) | Luis (friend) | `tickets.listForResale` | 109,685 | `0x24c771a0f14305e6cff063b4a799fc54cb072eb644fbd3e8dba7f3b145d424ad` |
| 109 | tour fund requests Foro Indie CDMX in 5 days (80 USDC deposit; waits for the venue) | Lumbre (artist) | `TripVault(artist).bookVenue` | 825,123 | `0x3707e2a35710dfb811fdec5a1dfa9f5faaf62c2836a53f3a26f26d2a4a3b1260` |
| 110 | vault books 1 night at Casa Azul (38 USDC; left for the host to accept in the UI) | Ana (traveler) | `TripVault.book` | 630,968 | `0x29b1fb57e1d2e790cd6a96e813e4ecbb31020a216783a5b6fab95aa26e2b167e` |
