# Rumbo by EmpowerTours · demo transcript: an Oaxaca trip that saves itself while you play

Generated 2026-10-18T10:10:35.793Z on Monad TESTNET (chain 10143), QA stack. Rumbo Test USDC (no value), throwaway test wallets funded from the deployer.

Monad charges the gas **limit**, so every tx is sent with limit = estimate × 1.10; "gas used" below equals the limit charged.

## Outcome

- Trip vault `0x0f604453d15001dad4106da5c73247b90F51BeaF`: **64.10% funded (320.5 / 500 USDC incl. 254 already spent on bookings)**
- Vault balance now 66.5 USDC; principal 320.5; yield earned 0 USDC (mock pool, 30 simulated days)
- Streak: **13 days** (best 13); 27 proved visits
- $TOURS: Ana 296 earned → 176 after a 150 perk (burned); Luis 40 from backing; supply 226
- Treasury revenue: 0 USDC (sponsor fees 222 + booking fees 6.48)
- Check-ins: 27 visits in **12 batched claims** (one per day) + Ana's show ticket scan → streak 13
- Oaxaca show: 5 tickets, gross 60 USDC → Lumbre 40.32, Foro Oaxaca 17.28, fee 2.4; venue deposit released 48.5
- CDMX show: venue cancelled → 80 USDC back to Lumbre's tour fund, 3 tickets (45 USDC) refunded; escrows now tickets 36 / venues 130
- Venue reliability: Oaxaca 1 held / 0 cancelled; CDMX 0 / 1
- Treasury fee breakdown: sponsor 222 + bookings 6.48 + venue deposits 1.5 + tickets 2.928
- Casa Azul cancellation: refunded automatically; Ana's leash allowance for that host back to 38 USDC spent
- 110 transactions, 29,573,312 gas, 3.0165 MON on Monad testnet

## Refused by the contracts (simulated, never sent)

| Section | Attempt | By | Revert |
|---|---|---|---|
| 1 | Ana tries to pay Marisol before the trip window opens | Ana (traveler) | `TripNotStarted()` |
| 2 | replay the same signed batch | Ana (traveler) | `VisitReused(0x0e8897cbb58244b1c1a16470c7a744390454a8d226452dd1597fb595143935b9)` |
| 2 | single claim for a stop already claimed in that day's batch | Ana (traveler) | `AlreadyClaimedToday(20743)` |
| 2 | Luis forges his own batch attestation | Luis (friend) | `BadAttestation()` |
| 3 | Ana tries to send $TOURS to Luis (points mode) | Ana (traveler) | `NonTransferable()` |
| 4 | book a hostel whose owner is not on the leash | Ana (traveler) | `NotApprovedVendor(0x26B8daF04f77cE74056a35B9958A87CDae517845)` |
| 4 | book 4 nights at Casita Jalatlaco (168 > 160 USDC cap) | Ana (traveler) | `VendorCapExceeded(0x0824b94b52198548111f1C5A80C6A71f58067B1D, 168000000, 160000000)` |
| 4 | a check-in proof signed by the global Hunt key no longer releases a host escrow | Marisol (local guide) | `BadAttestation()` |
| 5 | tour fund books a venue that is not on the leash | Lumbre (artist) | `NotApprovedVendor(0xeBBc7B4Ca8e16d65B5aD80c6644DF51145D42a45)` |
| 5 | fans try to buy CDMX tickets before the venue accepts the request | Sofía (fan) | `AwaitingApproval()` |
| 5 | door-scalping lock: after the first scan Sofía tries to pass her spare ticket to Marisol (holds none) | Sofía (fan) | `TransferLocked()` |
| 5 | scan Ana's ticket a second time | Foro Lumbre Oaxaca (venue) | `AlreadyUsed()` |
| 5 | the global Hunt key can no longer attest a show | Foro Lumbre Oaxaca (venue) | `BadAttestation()` |
| 5 | buy a ticket for the cancelled CDMX show | Sofía (fan) | `NotOnSale()` |
| 5b | Luis lists a ticket at 13.21 USDC (cap is 110% of 12 = 13.20) | Luis (friend) | `PriceAboveCap(13210000, 13200000)` |

## 0. Partners set up (sponsored stops, listings, perks)

| # | Action | From | Call | Gas | Tx hash |
|---|---|---|---|---|---|
| 1 | faucet 1,000 rtUSDC to Ana (traveler) | Ana (traveler) | `usdc.faucet` | 63,550 | `0xcdfcd3dd2f1d4eb662c964abbf1b95f4b23790f3f4b6da742cd2289f10cf8617` |
| 2 | faucet 1,000 rtUSDC to Luis (friend) | Luis (friend) | `usdc.faucet` | 63,550 | `0x6963d6fe24683468c9daa5609441288c717e9d1871d6cdaf6301efd236f306c0` |
| 3 | faucet 1,000 rtUSDC to Marisol (local guide) | Marisol (local guide) | `usdc.faucet` | 63,550 | `0x56ed7814d0d46b0dec41055446c49e6d7555fb128032e845b8a3074d587a6e46` |
| 4 | faucet 1,000 rtUSDC to Casita Jalatlaco (host) | Casita Jalatlaco (host) | `usdc.faucet` | 63,550 | `0xdbab36495002ba1e75e02547a5819de039b9b8641cacb8737a9af2d95ba105ab` |
| 5 | faucet 1,000 rtUSDC to Lumbre (artist) | Lumbre (artist) | `usdc.faucet` | 63,550 | `0x8af13d0d557ebf9c6222997d554df73b40ec64101bd30a8bff747ff81c9c7f80` |
| 6 | faucet 1,000 rtUSDC to Foro Lumbre Oaxaca (venue) | Foro Lumbre Oaxaca (venue) | `usdc.faucet` | 63,550 | `0x762492cce7165f4f8ac25fa92678607459f9b945fbc7de0778e115ff9cb3458e` |
| 7 | faucet 1,000 rtUSDC to Foro Indie CDMX (venue) | Foro Indie CDMX (venue) | `usdc.faucet` | 63,550 | `0xd114a4f7fec80bcfd2baf1703e6c62497d070cae9effbdae73eae2927e9a9540` |
| 8 | faucet 1,000 rtUSDC to Sofía (fan) | Sofía (fan) | `usdc.faucet` | 63,550 | `0x176317f76e9ad974c81d9ef5a2422bb902f7045ee293d0525df9a7aee7a59df0` |
| 9 | Casita Jalatlaco (host) approves campaign budget | Casita Jalatlaco (host) | `usdc.approve` | 57,311 | `0x53e4027b3523db5ad6dfc1c284fe4022d3fa86f14589c6f187289333eac6dc6e` |
| 10 | Casita Jalatlaco (host) sponsors stop "Hunt cache · Jardín Etnobotánico" (300 USDC, 10% platform fee) | Casita Jalatlaco (host) | `rewards.createCampaign` | 314,897 | `0x409a1f6dbfc6be5256ddc2ecdcfc30cea8b6e9dbe08bfc7f0481958f323c8427` |
| 11 | Marisol (local guide) approves campaign budget | Marisol (local guide) | `usdc.approve` | 57,311 | `0x1a402e8c159cef004b99da748325f713c7a38cfee922586671b772a0201d821e` |
| 12 | Marisol (local guide) sponsors stop "Marisol's meeting point · Santo Domingo" (200 USDC, 10% platform fee) | Marisol (local guide) | `rewards.createCampaign` | 314,977 | `0x50079a7b7b1f40ccb5705779b786c8ce9ff80b824c8c9e877cc86606ac2095b9` |
| 13 | Lumbre (artist) approves campaign budget | Lumbre (artist) | `usdc.approve` | 57,311 | `0x502e299f23b6bf1cbbaae379c3a9ba223d9088516b7ae6de0d07f753cf61a368` |
| 14 | Lumbre (artist) sponsors stop "Lumbre mural · Calle Macedonio Alcalá" (100 USDC, 10% platform fee) | Lumbre (artist) | `rewards.createCampaign` | 326,937 | `0x963a3802f8d25ff12f24cc414165d8ffd08de180612880834d0526e5cc01453f` |
| 15 | Foro Lumbre Oaxaca (venue) approves campaign budget | Foro Lumbre Oaxaca (venue) | `usdc.approve` | 57,311 | `0x9367c16e2e7b2d7bfcaab1b3056f891c30a89cb17433a87f8b0a9eaa1dc6a059` |
| 16 | Foro Lumbre Oaxaca (venue) sponsors stop "Foro Lumbre Oaxaca · patio murals" (80 USDC, 10% platform fee) | Foro Lumbre Oaxaca (venue) | `rewards.createCampaign` | 314,897 | `0xe91e6b0c375bce58ca65015f449886b31822c6e8c212c538a1f8b8ffc36d6061` |
| 17 | Foro Indie CDMX (venue) approves campaign budget | Foro Indie CDMX (venue) | `usdc.approve` | 57,311 | `0x70dea687c5587ded09c88fcb83d7f5b00496a79ccd1e222c8644a8828bcbcaf9` |
| 18 | Foro Indie CDMX (venue) sponsors stop "Foro Indie CDMX · Roma mural walk" (60 USDC, 10% platform fee) | Foro Indie CDMX (venue) | `rewards.createCampaign` | 326,871 | `0x9aea31b9bee0f25eb76b407c313893f5a765f46d36b46e790c99c75126e105e0` |
| 19 | Marisol (local guide) lists "Mezcal & Monte Albán day tour" at 45 USDC | Marisol (local guide) | `bookings.createListing` | 208,315 | `0xa680feb82e5610ff6eb2cd83f28da1e5e9f46e7a11cb97281728478f53360fd2` |
| 20 | Casa Azul (host) lists "Casa Azul · garden room" at 38 USDC | Casa Azul (host) | `bookings.createListing` | 220,290 | `0x2cdd9150e0828169213ae74086a5b8fb62fe463b7bcff161581be08249a42757` |
| 21 | Casita Jalatlaco (host) lists "Casita Jalatlaco · whole casita" at 42 USDC | Casita Jalatlaco (host) | `bookings.createListing` | 239,485 | `0xdef242fee855512caa3d7f35798d93387f3135e67a396fcd0e06a824d338dd27` |
| 22 | Luis (friend) lists "Random hostel (not on the leash)" at 25 USDC | Luis (friend) | `bookings.createListing` | 239,299 | `0xa3b6e5a6b54ef4ea3be87960e8fca09d08c22d08876bdcec4c9c33b6ad827f84` |
| 23 | Marisol (local guide) lists "Coyoacán & Frida walk" at 35 USDC | Marisol (local guide) | `bookings.createListing` | 208,236 | `0xf7e47e5ca964eb94c4c33d94272c332139efbb171bf494668e75356bc11dadcd` |
| 24 | Casa Roma (host) lists "Casa Roma · garden loft" at 55 USDC | Casa Roma (host) | `bookings.createListing` | 208,289 | `0x03db6a01d2f156d7a252c598f6dc09aebf800dfa6a033ca80c74e0c0bebf417a` |
| 25 | EmpowerTours approves Lumbre as a perk partner | EmpowerTours admin (deployer) | `perks.setPartner` | 44,953 | `0xa0b34e5d9c8fa347243708ae3d2548e975cb51ee0d115c7740b0391024f3e050` |
| 26 | EmpowerTours approves Marisol as a perk partner | EmpowerTours admin (deployer) | `perks.setPartner` | 44,953 | `0xa0bec9aee25c8a9ae3c7fa1acad1b190d502ce5aa69fe3fbe790ec7d97b927e0` |
| 27 | Lumbre lists perk "Backstage pass · Lumbre live in Oaxaca" for 150 $TOURS | Lumbre (artist) | `perks.listPerk` | 193,948 | `0x3229331bb60f2ef44bc68543bd56b4891811d3edc2b04bd82a5c5f079c04c230` |
| 28 | Marisol Tours lists perk "10% off the Mezcal & Monte Albán tour" for 60 $TOURS | Marisol (local guide) | `perks.listPerk` | 194,015 | `0xb229f348936a4ee910c5e64aa90146351a81d7e12343f9a3ae8717085fd3acb4` |
| 29 | Foro Lumbre Oaxaca (venue) lists venue "Foro Lumbre Oaxaca" (70/30 ticket split, 50 USDC deposit, 20 cancel fee) | Foro Lumbre Oaxaca (venue) | `venues.listVenue` | 230,986 | `0x5f797094100c04f8abc990f9bf97d11f18d855d3d93e9222131d0f794c803b0c` |
| 30 | Foro Lumbre Oaxaca opens its calendar (next 14 days) | Foro Lumbre Oaxaca (venue) | `venues.setOpenDates` | 494,637 | `0x77e1e4c2f8d7735abcd4d2c577cb1638a298e690712a75e065da40edd55663b9` |
| 31 | Foro Indie CDMX (venue) lists venue "Foro Indie CDMX" (flat fee 80 USDC, 30 cancel fee) | Foro Indie CDMX (venue) | `venues.listVenue` | 231,066 | `0xc025265cef47b637f68c3adbdd024fdcbeb90cd9c80f479c9a1a6e76e2608d2c` |
| 32 | Foro Indie CDMX opens its calendar (next 14 days) | Foro Indie CDMX (venue) | `venues.setOpenDates` | 494,637 | `0xbca2481fbaaba9e29c799cd4482d164c3d2cfd55b7aedd0b51d82c4dc543a212` |
| 33 | Casa Azul (host) lists venue "Bar La Cantina (not on the leash)" (80/20) | Casa Azul (host) | `venues.listVenue` | 281,682 | `0x2acb56e117c9907e63d620f8166e3ae3bc5b77722fb5c165bdcdc5bea3ec0adf` |
| 34 | Bar La Cantina (not on the leash) opens its calendar (next 14 days) | Casa Azul (host) | `venues.setOpenDates` | 494,637 | `0x9874096da41b5951057bda63bf55ec187b18eb909ca611e89183affbdc82bd32` |
| 35 | Foro Lumbre Oaxaca registers its door-scanner key | Foro Lumbre Oaxaca (venue) | `venues.setScanner` | 77,213 | `0x248633f2d776068907f1abe46a666a2bc0307668def14573c4f9421fc042cc26` |
| 36 | Foro Indie CDMX registers its door-scanner key | Foro Indie CDMX (venue) | `venues.setScanner` | 77,213 | `0x813ecd1fbb841500b56e949809205c3b7e995ea6c754d22ed75016fa7069a863` |
| 37 | Foro Indie CDMX turns on manual approval (bookings arrive as requests) | Foro Indie CDMX (venue) | `venues.setManualApproval` | 76,388 | `0x116f58b2eb7893ae978359d04143f432aa25cd1ca21c31bdea851589d41fbcb8` |
| 38 | Marisol (local guide) registers its own phone as check-in scanner | Marisol (local guide) | `bookings.setScanner` | 36,329 | `0xff496e4327fc637cc41c1cd6dcdd86edd1e24ea26a5f9798eea714853703957c` |
| 39 | Casa Azul (host) registers its own phone as check-in scanner | Casa Azul (host) | `bookings.setScanner` | 36,329 | `0x8ceaf80193885c1eaf651efa8e095f4d3b62ab187d40217b696b2094037042ca` |
| 40 | Casita Jalatlaco (host) registers its own phone as check-in scanner | Casita Jalatlaco (host) | `bookings.setScanner` | 36,329 | `0xcba59fef674ae710e1d667cf5be1e0f5dbcf461b3483f9665004c16860383a50` |
| 41 | Casa Roma (host) registers its own phone as check-in scanner | Casa Roma (host) | `bookings.setScanner` | 36,329 | `0x2c46eddec5358a701221cb8c8cfe651cbed742e539f576bee1d00ecc5b085932` |

## 1. Ana opens an Oaxaca trip vault with a leash; Luis chips in

| # | Action | From | Call | Gas | Tx hash |
|---|---|---|---|---|---|
| 42 | Ana creates trip "Oaxaca, MX · March 2027", goal 500 USDC, leash: 3 vendors, total cap 450 | Ana (traveler) | `factory.createVault` | 706,184 | `0xbdd1a37e0c59503c50fc0f979734e4bc448cfe7c3f249ae925317be903bb7bb6` |
| 43 | Ana approves 200 USDC | Ana (traveler) | `usdc.approve` | 57,311 | `0x930a6af691e3830aa4cabb9298960e3a75c5a9be3d707fb21ff2027389605451` |
| 44 | Ana saves 200 USDC (auto-supplied to the lending pool) | Ana (traveler) | `TripVault.deposit` | 344,399 | `0x0088f59dd4b525e3cd6d2b5eacd4e07fdb3b68280d1e111370587019926ace0f` |
| 45 | Luis approves 100 USDC | Luis (friend) | `usdc.approve` | 57,311 | `0xd0dacdb6fa514f37356e79ac757d11c5f1c33cd85d51fe10ea3bed2f95c361e0` |
| 46 | Luis chips in 100 USDC to Ana's trip | Luis (friend) | `TripVault.deposit` | 268,411 | `0x0b02f76e474c33de101198a256cfa8737ea0c7ee4155b076ace03072a027b148` |

## 2. Twelve days of proved visits (Hunt GPS attestation) → rewards straight into the trip

| # | Action | From | Call | Gas | Tx hash |
|---|---|---|---|---|---|
| 47 | day 1: 2 visits (Hunt cache, Marisol's meeting point) in ONE batched claim (Ana submits it and pays her own gas) | Ana (traveler) | `rewards.claimBatch` | 576,242 | `0x8352a81a666412ac7be41cf496535fdbbe11a6fe99af6ff73cad4221db85ca58` |
| 48 | day 2: 2 visits (Hunt cache, Marisol's meeting point) in ONE batched claim (Ana submits it and pays her own gas) | Ana (traveler) | `rewards.claimBatch` | 463,844 | `0x3cd28d64177d3b4b50438333e6a72144d520e4c9987a47d7e4c37cdb362238eb` |
| 49 | day 3: 2 visits (Hunt cache, Lumbre mural) in ONE batched claim (Ana submits it and pays her own gas) | Ana (traveler) | `rewards.claimBatch` | 479,615 | `0x8dca6ec8cd7d06d1e152087ed5585dc08dde7697d8ae2250305013aa5ae943cf` |
| 50 | day 4: 3 visits (Hunt cache, Marisol's meeting point, Foro Lumbre Oaxaca) in ONE batched claim (Ana submits it and pays her own gas) | Ana (traveler) | `rewards.claimBatch` | 532,215 | `0x841b1d438468b50160f7c8bd211424d75c77e608de0cad25be2c624c21cec4c5` |
| 51 | day 5: 2 visits (Hunt cache, Marisol's meeting point) in ONE batched claim (Ana submits it and pays her own gas) | Ana (traveler) | `rewards.claimBatch` | 498,450 | `0x98f179ec112c8db50dd9cef63ed266fb0b2baf23d15f0359941646f779ac9f82` |
| 52 | day 6: 2 visits (Hunt cache, Lumbre mural) in ONE batched claim (Ana submits it and pays her own gas) | Ana (traveler) | `rewards.claimBatch` | 479,615 | `0x2325240b86902baff73b720a85a9d684ce5e581fa055cbf159c1b480aa55c8b5` |
| 53 | day 7: 2 visits (Hunt cache, Marisol's meeting point) in ONE batched claim (Ana submits it and pays her own gas) | Ana (traveler) | `rewards.claimBatch` | 460,714 | `0x8c3cc2ec4861729949552bdbaad30acba1c6164e3d6c675880cdd2cfce6b1a9b` |
| 54 | day 8: 3 visits (Hunt cache, Marisol's meeting point, Foro Lumbre Oaxaca) in ONE batched claim (Ana submits it and pays her own gas) | Ana (traveler) | `rewards.claimBatch` | 532,215 | `0x804d4e99cdc26baac8c10ce2091123c98842f6b44161c8fcb7f714168d4edd52` |
| 55 | day 9: 2 visits (Hunt cache, Lumbre mural) in ONE batched claim (Ana submits it and pays her own gas) | Ana (traveler) | `rewards.claimBatch` | 460,766 | `0x17c63f95425ca24afbe17a0a0fc9233de8e966eac371f5c82218545114643bb7` |
| 56 | day 10: 2 visits (Hunt cache, Marisol's meeting point) in ONE batched claim (Ana submits it and pays her own gas) | Ana (traveler) | `rewards.claimBatch` | 460,766 | `0x9be50ba791bf7d0734e564f5a09e9a389b3c23b85685c65697763fc9b6fdf481` |
| 57 | day 11: 2 visits (Hunt cache, Marisol's meeting point) in ONE batched claim (Ana submits it and pays her own gas) | Ana (traveler) | `rewards.claimBatch` | 460,766 | `0xc5469138a5d1dbcc0a88b1a3a56b80e59d222144e9419fe0c4efac6f6b9e3280` |
| 58 | day 12: 3 visits (Hunt cache, Lumbre mural, Foro Lumbre Oaxaca) in ONE batched claim (Ana submits it and pays her own gas) | Ana (traveler) | `rewards.claimBatch` | 513,366 | `0x6287f7227e9d2e668be39599117e420e34be413127a2751d9dccb8ac2324b1f8` |

## 3. Yield accrues; Ana and Luis back an artist; Ana redeems a perk with $TOURS

| # | Action | From | Call | Gas | Tx hash |
|---|---|---|---|---|---|
| 59 | Lumbre opens a fan-backed tour fund (leash: Foro Oaxaca ≤100, Foro CDMX ≤150) | Lumbre (artist) | `factory.createVault` | 640,718 | `0xe645932b2d01ec6c02685aa5421f2f288bf749f1af0f45dd055879183e014265` |
| 60 | Lumbre approves 200 USDC | Lumbre (artist) | `usdc.approve` | 57,297 | `0xaaabca847873483f8901f95ea6936e3ce7d9518e87d67448e3248e65f28865aa` |
| 61 | Lumbre puts 200 USDC of her own into the tour fund | Lumbre (artist) | `TripVault(artist).deposit` | 344,399 | `0xf3660d8c3afd5a85edfdf9a5246c205531b2beab14cd1f543058c8165e41aee5` |
| 62 | Luis approves 40 USDC | Luis (friend) | `usdc.approve` | 57,297 | `0x8671ea64cca065fb9866127fdfdfea9dd19ca210d10ab59e9528bb690b083d2a` |
| 63 | Luis backs Lumbre's tour with 40 USDC (perks, not a revenue share) | Luis (friend) | `TripVault(artist).deposit` | 268,411 | `0x1327751649f80cd9325b7b4407c0e70c0f8f5f1927ad2a1a7bb17640d89e9e9d` |
| 64 | Ana approves 20 USDC | Ana (traveler) | `usdc.approve` | 57,297 | `0x21485bf14de98357089e1ec621d4df9637c911fcfa2be41d0e5c38705a09e8fb` |
| 65 | Ana backs Lumbre's tour with 20 USDC | Ana (traveler) | `TripVault(artist).deposit` | 268,411 | `0x49abf95348f585019b8afbb5b858dd168d9c64223c568f3afd3770898de3216e` |
| 66 | Ana approves PerkMarket for 150 $TOURS | Ana (traveler) | `tours.approve` | 57,388 | `0x7842951bc088ff8c488a16e29cf59402f2212a2fe6f1ba6dcbec167e9959ed62` |
| 67 | Ana redeems "Backstage pass · Lumbre live in Oaxaca" (150 $TOURS burned) | Ana (traveler) | `perks.redeem` | 238,015 | `0x2670f521b955fae85a3ea52db098d371d0f0c2fc2d1c41cd2e9e3732056d1c71` |

## 4. Trip window opens: the vault books a guide and a stay through escrow

| # | Action | From | Call | Gas | Tx hash |
|---|---|---|---|---|---|
| 68 | vault books Mezcal & Monte Albán tour for 2 (90 USDC into escrow) | Ana (traveler) | `TripVault.book` | 590,786 | `0xb56e67599da7f6cc34cb257fe1d2bcee7a0e7e6900e64cfaf79a2aef17308d9b` |
| 69 | vault books 3 nights at Casa Azul (114 USDC into escrow) | Ana (traveler) | `TripVault.book` | 517,928 | `0x493254615eae09dfee961d71e0843696f4af203b1c870c38dcdf8de545545aec` |
| 70 | Casa Azul cancels → automatic full refund to the vault, leash allowance restored | Casa Azul (host) | `bookings.hostCancel` | 415,864 | `0x2dfa93e80daddbd30947d82bb19885d6cee23d21e0ea0dea63a669d0b47e26bc` |
| 71 | vault re-books 3 nights at Casita Jalatlaco (126 USDC into escrow) | Ana (traveler) | `TripVault.book` | 517,928 | `0x8580d974db630a0ab714c1077e7a2f42ceb7f36d2d9e3e098b2d6405539e45b3` |
| 72 | Marisol accepts the booking | Marisol (local guide) | `bookings.acceptBooking` | 76,344 | `0xf59c89286c71f341f5cb71960dd7b1472f75f8e66c132a606435c17f15aab824` |
| 73 | Marisol scans Ana in with her registered scanner → tour escrow released (3% fee to treasury) | Marisol (local guide) | `bookings.confirmWithAttestation` | 495,944 | `0x01dfccd2a5d0e773c40f9f01922de715cc56f74eebd67632fc031b433cfacacd` |
| 74 | Ana confirms check-in at Casita Jalatlaco → stay escrow released | Ana (traveler) | `TripVault.confirmCheckIn` | 515,526 | `0xb0406ec46a3342198cbdd4256a95e1a7080ef2a5c98a1ab0581c5d426c6e7f9e` |
| 75 | Ana anchors her tour review (rating 5 + keccak256 of the text) | Ana (traveler) | `bookings.anchorReview` | 136,079 | `0xcf97c184c450bf0fed6b2754822596c7ba484980d1f79c161d9797f909d7f022` |
| 76 | Ana anchors her stay review | Ana (traveler) | `bookings.anchorReview` | 136,093 | `0x788d77f73b85f0f44bdead903583d738e2ca1387c2da78396df67e28205b2ad3` |

## 5. Lumbre's tour: venue bookings, ticket sales, a show and a cancellation

| # | Action | From | Call | Gas | Tx hash |
|---|---|---|---|---|---|
| 77 | tour fund books Foro Lumbre Oaxaca for tonight (50 USDC deposit into escrow, 70/30 split) | Lumbre (artist) | `TripVault(artist).bookVenue` | 754,868 | `0x37df65306d2367682f8ffaca68d3930a372f4e56eeba2b3994c61a023eacc5cb` |
| 78 | tour fund books Foro Indie CDMX for tomorrow (80 USDC flat fee into escrow) | Lumbre (artist) | `TripVault(artist).bookVenue` | 737,232 | `0xf38bc809ecb53f65012f68e8e54caa2c0b210e440fdbd690348df4527806f8a3` |
| 79 | Foro Indie CDMX accepts Lumbre's booking request → tickets go on sale | Foro Indie CDMX (venue) | `venues.acceptShow` | 57,173 | `0x25dea8c426c54ac731f3c20c0b7567965360c112a36dc188e22effb862cdd520` |
| 80 | Ana (traveler) approves 12 USDC | Ana (traveler) | `usdc.approve` | 57,284 | `0x595994e3fc0742cb2e159579bbfc29c2a0e70100c8662635b98fcbdad20bf615` |
| 81 | Ana buys 1 ticket for Oaxaca (escrow) | Ana (traveler) | `tickets.buy` | 371,419 | `0x7a8a63fce182a2272a75a902fbb33eaff13177aa0c903fa8a7230226c57e954e` |
| 82 | Ana (traveler) approves 15 USDC | Ana (traveler) | `usdc.approve` | 57,297 | `0x0208c0c6db0dbc286511ff3cb13db9572599b8d8b3d14b3950d8f586ab1a5a0e` |
| 83 | Ana buys 1 ticket for CDMX (escrow) | Ana (traveler) | `tickets.buy` | 358,805 | `0xe7901412836b7360d8a1e7e07bfcaf4eee7c5bf0463b2d4988af9d5dcdf71344` |
| 84 | Luis (friend) approves 24 USDC | Luis (friend) | `usdc.approve` | 57,297 | `0x6e334a48eadc9eaa49ccb18f7a6a50080d683df12548a15df3d88f74eb72abe4` |
| 85 | Luis buys 2 tickets for Oaxaca | Luis (friend) | `tickets.buy` | 418,385 | `0x6567cee70ba15003486396080e0284cae12f2b915e49a706526f2cc819736a82` |
| 86 | Sofía (fan) approves 24 USDC | Sofía (fan) | `usdc.approve` | 57,297 | `0x8955937d43576f5cf8edc3eb2b5957ad0c764e180c4b46797762cb7de2eaf20b` |
| 87 | Sofía buys 2 tickets for Oaxaca | Sofía (fan) | `tickets.buy` | 418,385 | `0x94c82071531441aa7da63dd4abf444356d49a60679c530f937c5c682fe5c33be` |
| 88 | Sofía (fan) approves 30 USDC | Sofía (fan) | `usdc.approve` | 57,311 | `0x5a39cbadb61fdb7068a3a632bba4f00977072022324d04f91bea196bbbd649e6` |
| 89 | Sofía buys 2 tickets for CDMX | Sofía (fan) | `tickets.buy` | 399,562 | `0x608ddcab5afd62a652c60b74e5b34fa4218bf6442a034dada04114354ced4bff` |
| 90 | Luis claims backing $TOURS (unlocked by the share of tour money actually spent) | Luis (friend) | `rewards.claimBacking` | 211,970 | `0x3a8722f670be9ac4a5ab4510eaebc4408efae3318a97614f9e15dd06e00002d6` |
| 91 | door scan: Ana (traveler)'s ticket #0 (check-in → $TOURS + streak; venue submits, pays gas) | Foro Lumbre Oaxaca (venue) | `tickets.scan` | 244,744 | `0xd527cd42e2692d599702d97db0c2196a4673aa67e29f3e9db1b883870f26e20c` |
| 92 | door scan: Luis (friend)'s ticket #2 (check-in → $TOURS + streak; venue submits, pays gas) | Foro Lumbre Oaxaca (venue) | `tickets.scan` | 240,947 | `0x070ecffcd09f4a9aaa8ea9a22e91706d8795ebf92265d682841bfba13b5a628c` |
| 93 | door scan: Luis (friend)'s ticket #3 (check-in → $TOURS + streak; venue submits, pays gas) | Foro Lumbre Oaxaca (venue) | `tickets.scan` | 219,015 | `0x268764c848999efed0b8d6d40edcbb517cbafe0cd7b7d4e7423580094b70b96c` |
| 94 | door scan: Sofía (fan)'s ticket #4 (check-in → $TOURS + streak; venue submits, pays gas) | Foro Lumbre Oaxaca (venue) | `tickets.scan` | 259,782 | `0x8a78691e0729f464d451aaea10f506d5f688c552302cdd88ec3f77e2feb2e1ea` |
| 95 | Sofía passes her spare ticket to Luis (already a holder → allowed) | Sofía (fan) | `tickets.transferTicket` | 168,979 | `0x016c421807efb47ada523e967f04f88b414a51b7dd22c80607a70ee457b455f3` |
| 96 | Foro Oaxaca submits its door-QR check-in attestation → show Played, deposit released (3% fee) | Foro Lumbre Oaxaca (venue) | `venues.confirmShow` | 502,857 | `0x79a019a2b1b68423a68d576148f790c84e9d595f1609822673f914d6949c5c5d` |
| 97 | settle Oaxaca ticket escrow → 4% fee, venue 30%, Lumbre 70% (Lumbre triggers it) | Lumbre (artist) | `tickets.settle` | 213,359 | `0x18ef7e8ec8f06552e5e25f5fb145296da38d54e8dcabaad16ae44191edce3d06` |
| 98 | Foro Indie CDMX cancels → Lumbre's tour fund refunded automatically (80 USDC), leash restored | Foro Indie CDMX (venue) | `venues.venueCancel` | 458,684 | `0xfed8f91bc805234c1dd287a7857f088663d5ca4cb2960e07455dbdccade93fe4` |
| 99 | refund every CDMX ticket holder in one call (anyone can trigger; the venue does) | Foro Indie CDMX (venue) | `tickets.refundAll` | 194,183 | `0xc1fb19406becb3bd1e8839e96c753e4a98aa1dd7097a288ab5fb1624cc6213bb` |

## 5b. Resale (≤110% of face, artist royalty, EmpowerTours fee), the door lock, and open requests for the UI

| # | Action | From | Call | Gas | Tx hash |
|---|---|---|---|---|---|
| 100 | tour fund books Foro Lumbre Oaxaca again in 3 days (50 USDC deposit) | Lumbre (artist) | `TripVault(artist).bookVenue` | 704,270 | `0x1531ea960876fa8e050816558708d4ab3be4a57699048a51902f34bc9a6bbab8` |
| 101 | Luis (friend) approves 24 USDC | Luis (friend) | `usdc.approve` | 57,297 | `0x69766c5940b0b01635952875af492cc2837eb78b876a89ef50e2e1fdf44a3d40` |
| 102 | Luis buys 2 tickets for Oaxaca night 2 | Luis (friend) | `tickets.buy` | 456,396 | `0x6e0b9d3f29889bf1d2e7b0929186950c0261c16131b97840e4e6d23468a4c961` |
| 103 | Sofía (fan) approves 12 USDC | Sofía (fan) | `usdc.approve` | 57,284 | `0xf921f7b63fc8af92bc4e028a1c23e2586248fc92c098eff2538bf71fa12b0e31` |
| 104 | Sofía buys 1 ticket for Oaxaca night 2 | Sofía (fan) | `tickets.buy` | 320,794 | `0xf905fff43f7cf39157a948a1196c153b45f4171be9cb1e0a7195b77fa6377b8f` |
| 105 | Luis lists ticket at 13.20 USDC (110% of face) | Luis (friend) | `tickets.listForResale` | 109,685 | `0xd1c6fcacf205065632ca9d92b7f6cb20f108cc35cff043c50f59777d0deb68fd` |
| 106 | Ana approves 13.20 USDC | Ana (traveler) | `usdc.approve` | 57,297 | `0x698c8daead49fd6dead27086755ec4dbbd6ea3b22de0b2baaee810d7c7ab77e2` |
| 107 | Ana buys Luis's resale ticket → 4% fee, 5% royalty to Lumbre, rest to Luis | Ana (traveler) | `tickets.buyResale` | 315,767 | `0xd8f04b44a437d5fd3849ca86a3b3cabb4499438757616a38108ad355a8577226` |
| 108 | Luis lists his second ticket at 12.60 USDC (left open for the UI) | Luis (friend) | `tickets.listForResale` | 109,685 | `0x4cd49c0aa0ea935bc84a7fe64b9e99a8781cacace5fc762257b432217624715c` |
| 109 | tour fund requests Foro Indie CDMX in 5 days (80 USDC deposit; waits for the venue) | Lumbre (artist) | `TripVault(artist).bookVenue` | 769,073 | `0xcf5b8b751d42c152023ae7d6715f0a9eaddd2597ac57f9101ee8dd8c3052a896` |
| 110 | vault books 1 night at Casa Azul (38 USDC; left for the host to accept in the UI) | Ana (traveler) | `TripVault.book` | 555,922 | `0xa4544ce7d5f4ab67bb600bfd9be569fb45166e2fee3c29f30ab4663171ff1274` |
