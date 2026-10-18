# Rumbo by EmpowerTours · demo transcript: an Oaxaca trip that saves itself while you play

Generated 2026-10-18T02:12:12.758Z on LOCAL Monad Solonet (chain 20143, http://localhost:8080). Mock USDC, test accounts. Nothing public.

Monad charges the gas **limit**, so every tx is sent with limit = estimate × 1.10; "gas used" below equals the limit charged.

## Outcome

- Trip vault `0x22477edd6a77A8BD4d60afCc0764AFebE0953D6D`: **64.36% funded (321.81721 / 500 USDC incl. 254 already spent on bookings)**
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
- 110 transactions, 32,488,301 gas, 3.3138 MON at Solonet's 100 gwei base fee

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
| 1 | faucet 1,000 mock USDC to Ana (traveler) | Ana (traveler) | `usdc.faucet` | 70,128 | `0xb57adb1bce6f4212f50f86255d9582da788a7f2b06b60c0ff1c1c7caeec3e984` |
| 2 | faucet 1,000 mock USDC to Luis (friend) | Luis (friend) | `usdc.faucet` | 70,115 | `0x0b9d26876c526908e08cebad4bcc76fa3f9934be1856898f00700243106bae52` |
| 3 | faucet 1,000 mock USDC to Marisol (local guide) | Marisol (local guide) | `usdc.faucet` | 70,128 | `0x70d3fb172ea2ac383d76349ed1cc7d81e507263a9b6992ca1a06bd4666a38056` |
| 4 | faucet 1,000 mock USDC to Casita Jalatlaco (host) | Casita Jalatlaco (host) | `usdc.faucet` | 70,128 | `0x4063db4ff03edf7275f98f5aa196facc378534943ef0b3632ff1c373eac18814` |
| 5 | faucet 1,000 mock USDC to Lumbre (artist) | Lumbre (artist) | `usdc.faucet` | 70,128 | `0xef554e2d0ab7429a830b0c1543b2719dd220c32475e84df29b5fd8fe0f97c45b` |
| 6 | faucet 1,000 mock USDC to Foro Lumbre Oaxaca (venue) | Foro Lumbre Oaxaca (venue) | `usdc.faucet` | 70,115 | `0x25fcb7ec159a062397c39b6ff4b5657ce1e8b262a31386f2e0f2733142ec35d2` |
| 7 | faucet 1,000 mock USDC to Foro Indie CDMX (venue) | Foro Indie CDMX (venue) | `usdc.faucet` | 70,128 | `0xebf8c74fe1f3d95665035b1e415fab513f706a0b61a7ebd2abfaee6f3b6c3f3a` |
| 8 | faucet 1,000 mock USDC to Sofía (fan) | Sofía (fan) | `usdc.faucet` | 70,128 | `0x2c1c3e07b6a40d1967caca9390ae4c3da8b3d9897e1da57b9cc95c9c8e7d02a1` |
| 9 | Casita Jalatlaco (host) approves campaign budget | Casita Jalatlaco (host) | `usdc.approve` | 57,311 | `0x06e67fb8e7568e18f693b784fde7c4a81d067ccc7cfac2a69e62a5b04c72ef41` |
| 10 | Casita Jalatlaco (host) sponsors stop "Hunt cache · Jardín Etnobotánico" (300 USDC, 10% platform fee) | Casita Jalatlaco (host) | `rewards.createCampaign` | 390,120 | `0xf28cbfc834815b5a83070b6e7f06df66c51ad1f73b9c352ccbc297096b1b4cae` |
| 11 | Marisol (local guide) approves campaign budget | Marisol (local guide) | `usdc.approve` | 57,311 | `0x90962b63b9eaff3456f2e69638a3528520ece73d912706cbafe2871c0b21dff1` |
| 12 | Marisol (local guide) sponsors stop "Marisol's meeting point · Santo Domingo" (200 USDC, 10% platform fee) | Marisol (local guide) | `rewards.createCampaign` | 314,806 | `0x4da78a9a44a14a56d056686650dc6adc31c03a43827deb87e0319e723f23af03` |
| 13 | Lumbre (artist) approves campaign budget | Lumbre (artist) | `usdc.approve` | 57,311 | `0x74ce55b7b6c6e4fc601dcdb547988617dbd240efcee83febf3ce513f860cd3d9` |
| 14 | Lumbre (artist) sponsors stop "Lumbre mural · Calle Macedonio Alcalá" (100 USDC, 10% platform fee) | Lumbre (artist) | `rewards.createCampaign` | 314,792 | `0x464e00de577637135f36143b0eb193f1a5968a1def723893b64a4f6ae592533e` |
| 15 | Foro Lumbre Oaxaca (venue) approves campaign budget | Foro Lumbre Oaxaca (venue) | `usdc.approve` | 57,311 | `0x07774abf590ef29729f1a648a30edc22aebdd0c0f0251e8686746594eff15205` |
| 16 | Foro Lumbre Oaxaca (venue) sponsors stop "Foro Lumbre Oaxaca · patio murals" (80 USDC, 10% platform fee) | Foro Lumbre Oaxaca (venue) | `rewards.createCampaign` | 314,726 | `0xdc1b101ebaff7b440740d1762c9ffda822587eb7ddad9c53ebfb11dea58f2441` |
| 17 | Foro Indie CDMX (venue) approves campaign budget | Foro Indie CDMX (venue) | `usdc.approve` | 57,311 | `0xcd6e823c5740984d77cb2e70fadddd517b8d6d6f0b9a538935e387235ef0249f` |
| 18 | Foro Indie CDMX (venue) sponsors stop "Foro Indie CDMX · Roma mural walk" (60 USDC, 10% platform fee) | Foro Indie CDMX (venue) | `rewards.createCampaign` | 314,726 | `0x96307bd8b6e49d021ddc8b8140bbc6a5d37275448871741e303e10e7a76f23e4` |
| 19 | Marisol (local guide) lists "Mezcal & Monte Albán day tour" at 45 USDC | Marisol (local guide) | `bookings.createListing` | 224,060 | `0xb8c4ccecabefba3b19617cab7b2302cbed8d3a0b769674ec10b1c0d2eb4e6292` |
| 20 | Casa Azul (host) lists "Casa Azul · garden room" at 38 USDC | Casa Azul (host) | `bookings.createListing` | 227,164 | `0xf588b43b1511623103c348398186a56905d88c15470e9a63456d81c99b5b568a` |
| 21 | Casita Jalatlaco (host) lists "Casita Jalatlaco · whole casita" at 42 USDC | Casita Jalatlaco (host) | `bookings.createListing` | 258,333 | `0x69f2a7d758b698bdde76686754a81206cee452351b691199a6447457e1e89c4e` |
| 22 | Luis (friend) lists "Random hostel (not on the leash)" at 25 USDC | Luis (friend) | `bookings.createListing` | 258,148 | `0x29431718f068353364ea827e1cfbf65d6c05af6995efede08ceecfe4ae9a0b95` |
| 23 | Marisol (local guide) lists "Coyoacán & Frida walk" at 35 USDC | Marisol (local guide) | `bookings.createListing` | 208,236 | `0xbab70aaa41a3fb996235125c52e0d0194b4b07c15ce8a4dd847a9b5fe76ec3c6` |
| 24 | Casa Roma (host) lists "Casa Roma · garden loft" at 55 USDC | Casa Roma (host) | `bookings.createListing` | 227,137 | `0x23bd2047890fe5428c8856a8637b07414632fd276ebaf16731e86011cee22a9d` |
| 25 | EmpowerTours approves Marisol as a perk partner | EmpowerTours admin (deployer) | `perks.setPartner` | 66,411 | `0xad45c5dd5cbadc0cb6b8ddf9eae61e88ad693cf14576daa421ae5180a6062c4a` |
| 26 | Lumbre lists perk "Backstage pass · Lumbre live in Oaxaca" for 150 $TOURS | Lumbre (artist) | `perks.listPerk` | 212,797 | `0x91c9060af3a8d039cf853120e9cb823aaf263e17951451f8c98caf07435b9d42` |
| 27 | Marisol Tours lists perk "10% off the Mezcal & Monte Albán tour" for 60 $TOURS | Marisol (local guide) | `perks.listPerk` | 194,015 | `0x17ed666729351231cdc924eb86dbc21ca0371f7ea67850cf8bbdf6511e6b79ab` |
| 28 | Foro Lumbre Oaxaca (venue) lists venue "Foro Lumbre Oaxaca" (70/30 ticket split, 50 USDC deposit, 20 cancel fee) | Foro Lumbre Oaxaca (venue) | `venues.listVenue` | 246,730 | `0xc789d5ce738587155c4f2f30c58ca50d2ad24bc94dd9b92c06dfc78c4c4bb846` |
| 29 | Foro Lumbre Oaxaca opens its calendar (next 14 days) | Foro Lumbre Oaxaca (venue) | `venues.setOpenDates` | 494,623 | `0x2a9115711cd4b0ed2549aa00bf40362ce14593208183747761bdad3c139b1276` |
| 30 | Foro Indie CDMX (venue) lists venue "Foro Indie CDMX" (flat fee 80 USDC, 30 cancel fee) | Foro Indie CDMX (venue) | `venues.listVenue` | 249,914 | `0x9f8477c2dc1c0db35a5eaf875e334fd66f3e0fb396cf85193d9fa1e57b3bd4a9` |
| 31 | Foro Indie CDMX opens its calendar (next 14 days) | Foro Indie CDMX (venue) | `venues.setOpenDates` | 494,637 | `0xceffdba361e6ea9a35531fa6d9c13daa9d38d23704984e7e9d294fb53d6b80a3` |
| 32 | Casa Azul (host) lists venue "Bar La Cantina (not on the leash)" (80/20) | Casa Azul (host) | `venues.listVenue` | 300,531 | `0x5a2a027f5e11ef92f7436a0a5b370454aa12c424a015db25ad318e2ae013b933` |
| 33 | Bar La Cantina (not on the leash) opens its calendar (next 14 days) | Casa Azul (host) | `venues.setOpenDates` | 494,637 | `0x4cd06acb08999190344dd3958341a6872c825942bf84fa28959bfa2b5d18dbe1` |
| 34 | Foro Lumbre Oaxaca registers its door-scanner key | Foro Lumbre Oaxaca (venue) | `venues.setScanner` | 77,200 | `0x272c9b06eeeff1db11a6454f39cf98bf4a2f6dd03eafc46da8f5cdbb2c560c1a` |
| 35 | Foro Indie CDMX registers its door-scanner key | Foro Indie CDMX (venue) | `venues.setScanner` | 77,213 | `0xf869dc03569ce4011aa38f549ab2231fe257054223aae0e8c7556e2efbd6a008` |
| 36 | Foro Indie CDMX turns on manual approval (bookings arrive as requests) | Foro Indie CDMX (venue) | `venues.setManualApproval` | 76,388 | `0x5f76dfc4d49d99ddf9c9743fae104012dea341782bb17f5809f9332a0c05ac0e` |
| 37 | Marisol (local guide) registers its own phone as check-in scanner | Marisol (local guide) | `bookings.setScanner` | 58,196 | `0x98fea6e5c3aa506aed8ad73c2efe48538d8ce0e2063a82e6392e633f94c951e9` |
| 38 | Casa Azul (host) registers its own phone as check-in scanner | Casa Azul (host) | `bookings.setScanner` | 58,196 | `0x2d80e5d125fcc5aad0138d1283113e609fa05a7868220609567db4d8dfa97929` |
| 39 | Casita Jalatlaco (host) registers its own phone as check-in scanner | Casita Jalatlaco (host) | `bookings.setScanner` | 58,196 | `0x036203f381abcae96aa5379d3df17ff03350485148366c6f9b1df74f052981a9` |
| 40 | Casa Roma (host) registers its own phone as check-in scanner | Casa Roma (host) | `bookings.setScanner` | 58,196 | `0x8d7b2a573ef8771000716cf57e90da4f8d7e845fdd1cd0d15f97e69670614daa` |

## 1. Ana opens an Oaxaca trip vault with a leash; Luis chips in

| # | Action | From | Call | Gas | Tx hash |
|---|---|---|---|---|---|
| 41 | Ana creates trip "Oaxaca, MX · March 2027", goal 500 USDC, leash: 3 vendors, total cap 450 | Ana (traveler) | `factory.createVault` | 756,407 | `0x7ac14ef13ae4c0c698fa709308a6f8f94bb1f533ecc85599f6a665f72e105185` |
| 42 | Ana approves 200 USDC | Ana (traveler) | `usdc.approve` | 57,311 | `0x8504e3e238d7d7d9edefb030da3525574c0e07c858c50b3df228f992442bd9e6` |
| 43 | Ana saves 200 USDC (auto-supplied to the lending pool) | Ana (traveler) | `TripVault.deposit` | 477,243 | `0x63116e0c5e0c9ff0b9d7cbb624e3abd0a077b1adc9748e8099aa3a2aa08e2aa8` |
| 44 | Luis approves 100 USDC | Luis (friend) | `usdc.approve` | 57,311 | `0x765f6000b5a976d3e5ff941c6d5e36c688d23b8a205622edf1506d251a9fc9b5` |
| 45 | Luis chips in 100 USDC to Ana's trip | Luis (friend) | `TripVault.deposit` | 382,245 | `0x6a7aabed8ab9aa7b9e9382c7292707edc21dd2f42898b9cc02fe8a8ae1289a05` |

## 2. Twelve days of proved visits (Hunt GPS attestation) → rewards straight into the trip

| # | Action | From | Call | Gas | Tx hash |
|---|---|---|---|---|---|
| 46 | day 1: 2 visits (Hunt cache, Marisol's meeting point) in ONE batched claim (Ana submits it and pays her own gas) | Ana (traveler) | `rewards.claimBatch` | 689,187 | `0x4d42986f8184618cdb67c8f886e01194f37ef552f4199eba6ede10084d9cadee` |
| 47 | day 2: 2 visits (Hunt cache, Marisol's meeting point) in ONE batched claim (Ana submits it and pays her own gas) | Ana (traveler) | `rewards.claimBatch` | 573,712 | `0xa8d1540f9e906d027b696b74a32fb7e6378afcc80f7e6592418e776dbaf1f979` |
| 48 | day 3: 2 visits (Hunt cache, Lumbre mural) in ONE batched claim (Ana submits it and pays her own gas) | Ana (traveler) | `rewards.claimBatch` | 592,561 | `0xe45f9b1a618b62b9033d064e09d595c1fd18e3940e08e1b5bf81da4fe1d9d341` |
| 49 | day 4: 3 visits (Hunt cache, Marisol's meeting point, Foro Lumbre Oaxaca) in ONE batched claim (Ana submits it and pays her own gas) | Ana (traveler) | `rewards.claimBatch` | 648,264 | `0x83af7e5ea61b6eb654c3558fa528860cca097b877aff0fb145d1ab386003be1a` |
| 50 | day 5: 2 visits (Hunt cache, Marisol's meeting point) in ONE batched claim (Ana submits it and pays her own gas) | Ana (traveler) | `rewards.claimBatch` | 611,409 | `0x17bd92ab3bf6124018e46090ff7d62ad01aaee3c6a7bc98efb14778fcc35c639` |
| 51 | day 6: 2 visits (Hunt cache, Lumbre mural) in ONE batched claim (Ana submits it and pays her own gas) | Ana (traveler) | `rewards.claimBatch` | 595,652 | `0xbd585952f680b113d08744b11029770eab2be6d9a573b0ed208892074f22208a` |
| 52 | day 7: 2 visits (Hunt cache, Marisol's meeting point) in ONE batched claim (Ana submits it and pays her own gas) | Ana (traveler) | `rewards.claimBatch` | 573,712 | `0xf7b54944278c9311fb51d13c6823ffe1ed086890d6ff454cd9916a56a5a027fc` |
| 53 | day 8: 3 visits (Hunt cache, Marisol's meeting point, Foro Lumbre Oaxaca) in ONE batched claim (Ana submits it and pays her own gas) | Ana (traveler) | `rewards.claimBatch` | 645,133 | `0x61834daf391671d9deaf63bf0397d3a6403b44e264d5173f36fd5789ef4bf459` |
| 54 | day 9: 2 visits (Hunt cache, Lumbre mural) in ONE batched claim (Ana submits it and pays her own gas) | Ana (traveler) | `rewards.claimBatch` | 576,803 | `0x9b75cbe5e194b4e71755de93086e50ab478464c7c0913531973d3c17da053287` |
| 55 | day 10: 2 visits (Hunt cache, Marisol's meeting point) in ONE batched claim (Ana submits it and pays her own gas) | Ana (traveler) | `rewards.claimBatch` | 573,712 | `0x1e02535110095504319d7ece6ac7f1c78112a9586e15327a6e00d0c799280935` |
| 56 | day 11: 2 visits (Hunt cache, Marisol's meeting point) in ONE batched claim (Ana submits it and pays her own gas) | Ana (traveler) | `rewards.claimBatch` | 573,712 | `0x820d8f4c9aaba372b6ae6e94a268f1bfc1c71700650d569c38109fd4d00593ce` |
| 57 | day 12: 3 visits (Hunt cache, Lumbre mural, Foro Lumbre Oaxaca) in ONE batched claim (Ana submits it and pays her own gas) | Ana (traveler) | `rewards.claimBatch` | 626,285 | `0xc1715bde5dc1ad185d5d615dd3a51c6e328ba81b38912c699b9a80f1a50bfbab` |

## 3. Yield accrues; Ana and Luis back an artist; Ana redeems a perk with $TOURS

| # | Action | From | Call | Gas | Tx hash |
|---|---|---|---|---|---|
| 58 | DEMO ONLY: mock lending pool simulates 30 days of 5% APR (Solonet cannot warp time) | EmpowerTours admin (deployer) | `pool.fastForward` | 60,678 | `0x8a8f3ba080d0cdb4df560c0b8bdced7e6f4b46ecfbfbe8eec99c88f9a7587bcd` |
| 59 | Lumbre opens a fan-backed tour fund (leash: Foro Oaxaca ≤100, Foro CDMX ≤150) | Lumbre (artist) | `factory.createVault` | 652,933 | `0xa99dfbb4dea30da969fd1960ac44b20cf1d4ede832b19f115114750bfcab1b3f` |
| 60 | Lumbre approves 200 USDC | Lumbre (artist) | `usdc.approve` | 57,311 | `0x892540c85cad9342893d3eaaf94aa9e232c6893732c10393f98f1d7dc79ed4d6` |
| 61 | Lumbre puts 200 USDC of her own into the tour fund | Lumbre (artist) | `TripVault(artist).deposit` | 458,246 | `0x6b0aef34c039525b971ff1f5ddf7012f48a11f80c8863e06d09c1efacfac3917` |
| 62 | Luis approves 40 USDC | Luis (friend) | `usdc.approve` | 57,311 | `0x764d569ea251cd6233612164d81997e8646c0ab0bb3194625d18c0a9d6829e8e` |
| 63 | Luis backs Lumbre's tour with 40 USDC (perks, not a revenue share) | Luis (friend) | `TripVault(artist).deposit` | 382,245 | `0x28ed6301ba44253ad649ab9e29e50244394562151f71a806a7e960ce09954443` |
| 64 | Ana approves 20 USDC | Ana (traveler) | `usdc.approve` | 57,311 | `0xae2f71f90a536469db34514c73f60089c351cd60ed3e803c8b045a72de75e414` |
| 65 | Ana backs Lumbre's tour with 20 USDC | Ana (traveler) | `TripVault(artist).deposit` | 382,258 | `0xd91ef3d737e3870b595fe232799d3762cfcd7881b76c312b5ee7e672949d63a8` |
| 66 | Ana approves PerkMarket for 150 $TOURS | Ana (traveler) | `tours.approve` | 57,374 | `0xbd46890804eb8a8dc51e04485eff137f36c39f2aab8983e7ba2fdf6d2189cdd6` |
| 67 | Ana redeems "Backstage pass · Lumbre live in Oaxaca" (150 $TOURS burned) | Ana (traveler) | `perks.redeem` | 238,002 | `0x469c999206c9c18058f561d9de179d454379b20e58a897e8f7c37aa92540f59c` |

## 4. Trip window opens: the vault books a guide and a stay through escrow

| # | Action | From | Call | Gas | Tx hash |
|---|---|---|---|---|---|
| 68 | vault books Mezcal & Monte Albán tour for 2 (90 USDC into escrow) | Ana (traveler) | `TripVault.book` | 665,820 | `0x0f7b2632f255348c96302c2b4706a6a497f5593b1fe73e569339734d951540f2` |
| 69 | vault books 3 nights at Casa Azul (114 USDC into escrow) | Ana (traveler) | `TripVault.book` | 592,974 | `0x3b3537df95012bef7068800008b6fb3ea29af11cab0f2a8cffcc003c036b3667` |
| 70 | Casa Azul cancels → automatic full refund to the vault, leash allowance restored | Casa Azul (host) | `bookings.hostCancel` | 433,673 | `0xfe706073af5179fd5f5d64d8e7de9f4125df394f84e51abfd357f51e4bb94107` |
| 71 | vault re-books 3 nights at Casita Jalatlaco (126 USDC into escrow) | Ana (traveler) | `TripVault.book` | 573,978 | `0x206de75dde53be65d4a0ec9882f87a47179c23fc72cd2c8021d39978d1874ef8` |
| 72 | Marisol accepts the booking | Marisol (local guide) | `bookings.acceptBooking` | 76,344 | `0x31ace64fc243cf332c12c194b4edbac9c85567a7968506cf01239cfbcaace2c8` |
| 73 | Marisol scans Ana in with her registered scanner → tour escrow released (3% fee to treasury) | Marisol (local guide) | `bookings.confirmWithAttestation` | 496,409 | `0x9b5023483cab1384dc9ff7037228c37f1067a138b959ceb71fb70e1aa058c1e2` |
| 74 | Ana confirms check-in at Casita Jalatlaco → stay escrow released | Ana (traveler) | `TripVault.confirmCheckIn` | 512,883 | `0xf0b6d1f1f80622eebfe86347e68f8c838a529cb5e207ff60a0a9554daf132486` |
| 75 | Ana anchors her tour review (rating 5 + keccak256 of the text) | Ana (traveler) | `bookings.anchorReview` | 136,079 | `0xf329a59a077fa87e5a78830f5fa469c84745b2b37eb054b4d961ee48b9cb2209` |
| 76 | Ana anchors her stay review | Ana (traveler) | `bookings.anchorReview` | 136,093 | `0xa0eeb648a227ab1c15defee08579f3e06338945e2f2e3a2390a9ada257d091dc` |

## 5. Lumbre's tour: venue bookings, ticket sales, a show and a cancellation

| # | Action | From | Call | Gas | Tx hash |
|---|---|---|---|---|---|
| 77 | tour fund books Foro Lumbre Oaxaca for tonight (50 USDC deposit into escrow, 70/30 split) | Lumbre (artist) | `TripVault(artist).bookVenue` | 829,901 | `0x26c2e3ea6fa77426e8a515ba0da4b5189765b6b9d521f29db4d7bc7049a4339c` |
| 78 | tour fund books Foro Indie CDMX for tomorrow (80 USDC flat fee into escrow) | Lumbre (artist) | `TripVault(artist).bookVenue` | 812,278 | `0xa86b5377eb99cbca805e535c30601505cb5773acd0cbdf17a1e953fc3faedcb5` |
| 79 | Foro Indie CDMX accepts Lumbre's booking request → tickets go on sale | Foro Indie CDMX (venue) | `venues.acceptShow` | 57,173 | `0xf105ef4c49d0778d4f8c5218d7ec1d1e073f18b4ce4a1b341d04877fa58e30e1` |
| 80 | Ana (traveler) approves 12 USDC | Ana (traveler) | `usdc.approve` | 57,297 | `0x50771cd692f0889cecba3752559adb21311deb3e242c46961dcbb7916ed9a2fc` |
| 81 | Ana buys 1 ticket for Oaxaca (escrow) | Ana (traveler) | `tickets.buy` | 371,273 | `0x0f56ea4e0d5288504f139fa1b4ef02ffee9572f5d7467ecf1e3d6243302274ce` |
| 82 | Ana (traveler) approves 15 USDC | Ana (traveler) | `usdc.approve` | 57,311 | `0xe70d11b9b27335e25d136365f406f2e5298f6b26703180d1870ea22ba10a14ec` |
| 83 | Ana buys 1 ticket for CDMX (escrow) | Ana (traveler) | `tickets.buy` | 358,659 | `0xe50ec0ea1bf5e3801e9f107f6a2b69f5ac0a86953b57eab3be6478bf6dcb7268` |
| 84 | Luis (friend) approves 24 USDC | Luis (friend) | `usdc.approve` | 57,311 | `0xe292ce26e98f1658cc4a67ddbf999d40570ccd5cbd746d0477a8e3bf3c3467dd` |
| 85 | Luis buys 2 tickets for Oaxaca | Luis (friend) | `tickets.buy` | 418,238 | `0x25381591d86e53e3cdb6e1badf978e6263ddc1e6cd516e253c4f6faa5d48c059` |
| 86 | Sofía (fan) approves 24 USDC | Sofía (fan) | `usdc.approve` | 57,311 | `0xcc938f3e2016f2c1c83afe93e39d7310c0c6c887a9dd635d5edf9956969ca144` |
| 87 | Sofía buys 2 tickets for Oaxaca | Sofía (fan) | `tickets.buy` | 418,238 | `0x908ad0e57a28154f1624252db94662d18384075542ec94f753083422522fa59f` |
| 88 | Sofía (fan) approves 30 USDC | Sofía (fan) | `usdc.approve` | 57,324 | `0x782f962c76a7084a2d07e9dda5fe5fa4ed6829e41e7509c11aff8ff7081e86fe` |
| 89 | Sofía buys 2 tickets for CDMX | Sofía (fan) | `tickets.buy` | 399,416 | `0xf9f7d1ec4dc7a3e8f89257dc4e01deb8238d335d47fcf360179e24291b6b5d87` |
| 90 | Luis claims backing $TOURS (unlocked by the share of tour money actually spent) | Luis (friend) | `rewards.claimBacking` | 211,983 | `0xd401fa906304fc84d19362adda4d7dd4f6b4b69a5d9684de3bee4979c1a295d5` |
| 91 | door scan: Ana (traveler)'s ticket #0 (check-in → $TOURS + streak; venue submits, pays gas) | Foro Lumbre Oaxaca (venue) | `tickets.scan` | 244,744 | `0xdff925ec8eccc4c2c9bfa26ff7eadd1a81725db6249b742441dc7f1022eda522` |
| 92 | door scan: Luis (friend)'s ticket #2 (check-in → $TOURS + streak; venue submits, pays gas) | Foro Lumbre Oaxaca (venue) | `tickets.scan` | 240,934 | `0xe8b4f0c9c48ebd902a53d4b8f3396402593e609f56ef125ac69dafa381987b71` |
| 93 | door scan: Luis (friend)'s ticket #3 (check-in → $TOURS + streak; venue submits, pays gas) | Foro Lumbre Oaxaca (venue) | `tickets.scan` | 219,002 | `0xdc5af21a3e0eb51bf3074101dd7252ff27f3f283f2e08e20431a34317d6f7534` |
| 94 | door scan: Sofía (fan)'s ticket #4 (check-in → $TOURS + streak; venue submits, pays gas) | Foro Lumbre Oaxaca (venue) | `tickets.scan` | 259,795 | `0x3bc9da6a6bb72f711103cc4fb6b9016a2786ed7bbb9a9883e46470d4911cb31b` |
| 95 | Sofía passes her spare ticket to Luis (already a holder → allowed) | Sofía (fan) | `tickets.transferTicket` | 168,966 | `0x6a5745a27b09f4d3a5f9967db493962aabb7a88d1a2e7f1ffef145477926bfe2` |
| 96 | Foro Oaxaca submits its door-QR check-in attestation → show Played, deposit released (3% fee) | Foro Lumbre Oaxaca (venue) | `venues.confirmShow` | 503,281 | `0x762c53fb29158c5637238e4051f34415ae330236e5a17232de73c47650659432` |
| 97 | settle Oaxaca ticket escrow → 4% fee, venue 30%, Lumbre 70% (Lumbre triggers it) | Lumbre (artist) | `tickets.settle` | 213,286 | `0x2b36d17d2d483b085616247bad8bff864a8172e3c4280030e32e02121ed8e036` |
| 98 | Foro Indie CDMX cancels → Lumbre's tour fund refunded automatically (80 USDC), leash restored | Foro Indie CDMX (venue) | `venues.venueCancel` | 480,276 | `0x7602ed9c2a2398b0641f99dac126211c59c763af968af027c85369ff73ad655e` |
| 99 | refund every CDMX ticket holder in one call (anyone can trigger; the venue does) | Foro Indie CDMX (venue) | `tickets.refundAll` | 194,110 | `0xa43e97e5eeff50750c908ab6735abd58d4ab47a04eee83ebf6f6f60c546b3f1c` |

## 5b. Resale (≤110% of face, artist royalty, EmpowerTours fee), the door lock, and open requests for the UI

| # | Action | From | Call | Gas | Tx hash |
|---|---|---|---|---|---|
| 100 | tour fund books Foro Lumbre Oaxaca again in 3 days (50 USDC deposit) | Lumbre (artist) | `TripVault(artist).bookVenue` | 703,888 | `0x4c4ee33226f2308e719b535d1ab89b01cbe1a72a227db6e3e7410aaeab7af37d` |
| 101 | Luis (friend) approves 24 USDC | Luis (friend) | `usdc.approve` | 57,311 | `0xd531b63b15266f245955dcfe8393a91643fb1ecb3813ce131fe26b395d4a5746` |
| 102 | Luis buys 2 tickets for Oaxaca night 2 | Luis (friend) | `tickets.buy` | 456,250 | `0x88dddfea0adb459a10fe956cc72bc7c10231ca783e07ef089352ec86533a0942` |
| 103 | Sofía (fan) approves 12 USDC | Sofía (fan) | `usdc.approve` | 57,297 | `0x5a997fe53ca09a536ea3f6e6026d71e4fc3863e10666d351ec1d178b334ea530` |
| 104 | Sofía buys 1 ticket for Oaxaca night 2 | Sofía (fan) | `tickets.buy` | 320,647 | `0x130a05ea6c2c7b44a692f0bc3e4673109356ee8511ee8f0e00d27ce1c915d2c0` |
| 105 | Luis lists ticket at 13.20 USDC (110% of face) | Luis (friend) | `tickets.listForResale` | 109,685 | `0xb9724f0eb7d236593661b890759215ea38ada6b34089acb8f04e05dc71419e45` |
| 106 | Ana approves 13.20 USDC | Ana (traveler) | `usdc.approve` | 57,311 | `0x0a27f02b978fdbd41101e06a1e7c05d99140f38bebdc79323976a4e65e29309c` |
| 107 | Ana buys Luis's resale ticket → 4% fee, 5% royalty to Lumbre, rest to Luis | Ana (traveler) | `tickets.buyResale` | 315,767 | `0x6cc5e8be71762ef4ca43ed5bbd9c3973565a22d7a099298955cc44b99c4da2f4` |
| 108 | Luis lists his second ticket at 12.60 USDC (left open for the UI) | Luis (friend) | `tickets.listForResale` | 109,685 | `0x06224dfa016f14aba996c32d920ae6b561af5e7cbc8631c7c3aff582c769bf4d` |
| 109 | tour fund requests Foro Indie CDMX in 5 days (80 USDC deposit; waits for the venue) | Lumbre (artist) | `TripVault(artist).bookVenue` | 825,123 | `0xf81aedcdf75a23cd543c5bfbae1c3d51c868036b914671cc113d2dd05e3b234b` |
| 110 | vault books 1 night at Casa Azul (38 USDC; left for the host to accept in the UI) | Ana (traveler) | `TripVault.book` | 630,968 | `0x4f1b55cfc097acaf179947df2750adc09ace52a214c2f87387b8c86534f67ec0` |
