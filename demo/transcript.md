# Demo transcript: Oaxaca trip that saves itself while you play

Generated 2026-10-16T13:15:45.190Z on LOCAL Monad Solonet (chain 20143, http://localhost:8080). Mock USDC, test accounts. Nothing public.

Monad charges the gas **limit**, so every tx is sent with limit = estimate × 1.10; "gas used" below equals the limit charged.

## Outcome

- Trip vault `0xCf1085c6f528b90b55052766e38069f7A87Ed126`: **64.16% funded (320.813063 / 500 USDC incl. 216 already spent on bookings)**
- Vault balance now 104.813063 USDC; principal 319.5; yield earned 1.313063 USDC (mock pool, 30 simulated days)
- Streak: **12 days** (best 12); 25 proved visits
- $TOURS: Ana 288 earned → 138 after a 150 perk (burned); Luis 20 from backing; supply 158
- Treasury revenue: 71.48 USDC (sponsor fees 65 + booking fees 6.48)
- Casa Azul cancellation: refunded automatically; Ana's leash allowance for that host back to 0 USDC spent
- 68 transactions, 24,383,231 gas, 2.4871 MON at Solonet's 100 gwei base fee

## Refused by the contracts (simulated, never sent)

| Section | Attempt | By | Revert |
|---|---|---|---|
| 1 | Ana tries to pay Marisol before the trip window opens | Ana (traveler) | `TripNotStarted()` |
| 2 | replay the same signed visit | EmpowerTours/Hunt relayer (deployer) | `VisitReused(0x94792dcb500999aa00a681ee89a18f27f5a09ec41fb283bdfd827b8fc2345efc)` |
| 2 | second claim at the same stop on the same day (new visit id) | EmpowerTours/Hunt relayer (deployer) | `AlreadyClaimedToday(20742)` |
| 2 | Luis forges his own attestation | Luis (friend) | `BadAttestation()` |
| 3 | Ana tries to send $TOURS to Luis (points mode) | Ana (traveler) | `NonTransferable()` |
| 4 | book a hostel whose owner is not on the leash | Ana (traveler) | `NotApprovedVendor(0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC)` |
| 4 | book 4 nights at Casita Jalatlaco (168 > 160 USDC cap) | Ana (traveler) | `VendorCapExceeded(0x9965507D1a55bcC2695C58ba16FB37d819B0A4dc, 168000000, 160000000)` |

## 0. Partners set up (sponsored stops, listings, perks)

| # | Action | From | Call | Gas | Tx hash |
|---|---|---|---|---|---|
| 1 | faucet 1,000 mock USDC to Ana (traveler) | Ana (traveler) | `usdc.faucet` | 70,128 | `0x6ff00c8c913341b6a7b8cd92a55d4cc17b41f18dc2fd53b44e40b9558ca75977` |
| 2 | faucet 1,000 mock USDC to Luis (friend) | Luis (friend) | `usdc.faucet` | 70,115 | `0x3463b6904614aae7ed644c60f94583182d9ec620d1ed17a258138376805e757e` |
| 3 | faucet 1,000 mock USDC to Marisol (local guide) | Marisol (local guide) | `usdc.faucet` | 70,128 | `0x208e2c20d93c7867648b0c128c10ddf3888389f19449943347a48320977d3ad1` |
| 4 | faucet 1,000 mock USDC to Casita Jalatlaco (host) | Casita Jalatlaco (host) | `usdc.faucet` | 70,128 | `0x3ef7fd907bd54f6b7f1734c7779203ddf1786256b1ab00007c2c2dd09781caca` |
| 5 | faucet 1,000 mock USDC to Lumbre (artist) | Lumbre (artist) | `usdc.faucet` | 70,128 | `0x85dea39e26fd9aead7bf0a59d69c60d0e82970a3d009b98da610eb605084b5fe` |
| 6 | Casita Jalatlaco (host) approves campaign budget | Casita Jalatlaco (host) | `usdc.approve` | 57,311 | `0x08fe7b5954b6836fcbafa80d42a3fc69990b27ed292080119f33c7822f024098` |
| 7 | Casita Jalatlaco (host) sponsors stop "Hunt cache · Jardín Etnobotánico" (300 USDC, 10% platform fee) | Casita Jalatlaco (host) | `rewards.createCampaign` | 389,939 | `0x58ff75329fd96b170d054d32b641be6d387b3efa4ccc769017576d057a8af443` |
| 8 | Marisol (local guide) approves campaign budget | Marisol (local guide) | `usdc.approve` | 57,311 | `0x12ff47948801e0754bc344e7cf84810e6b9e65e5cd4e17dec37e6e81a72be4b0` |
| 9 | Marisol (local guide) sponsors stop "Marisol's meeting point · Santo Domingo" (200 USDC, 10% platform fee) | Marisol (local guide) | `rewards.createCampaign` | 314,625 | `0xe9ee6852a38688da0a1ff22e582315eb676b2a438c52aa6c016335728d87a452` |
| 10 | Lumbre (artist) approves campaign budget | Lumbre (artist) | `usdc.approve` | 57,311 | `0x4c66706a1c627c1190aa0ff7fb8905ef631b586e01595420e7c49b1b117bd4ee` |
| 11 | Lumbre (artist) sponsors stop "Lumbre mural · Calle Macedonio Alcalá" (100 USDC, 10% platform fee) | Lumbre (artist) | `rewards.createCampaign` | 314,612 | `0x209c15f8537cfbc249d02793e7230c4040dee130d08b3591852724edb4762726` |
| 12 | Lumbre (artist) approves campaign budget | Lumbre (artist) | `usdc.approve` | 57,324 | `0x96fa2b6c278a3cf92d7d7d8e51feb52cb8e10d974b506923502b4682b75f89dc` |
| 13 | Lumbre (artist) sponsors stop "Lumbre live · Foro (Friday show)" (50 USDC, 10% platform fee) | Lumbre (artist) | `rewards.createCampaign` | 314,546 | `0x1b4844e9d20803b6aab397178d327e32ef8f195f20b9aa3805bca19128851cc4` |
| 14 | Marisol (local guide) lists "Mezcal & Monte Albán day tour" at 45 USDC | Marisol (local guide) | `bookings.createListing` | 223,386 | `0xb976c1cafd5ad1d36dab872edc5ad3c44f190c91fb1eceeff1c147d06ae19cd0` |
| 15 | Casa Azul (host) lists "Casa Azul · garden room" at 38 USDC | Casa Azul (host) | `bookings.createListing` | 226,491 | `0xa4c1847997a1a67995674ac47f9f5e291991b7c03faa630d7eca652d6fbeec14` |
| 16 | Casita Jalatlaco (host) lists "Casita Jalatlaco · whole casita" at 42 USDC | Casita Jalatlaco (host) | `bookings.createListing` | 257,680 | `0xbc6cdc2e44b7a62a513fb7febe46c9d2bd9ebee93b1b2f43b499ee05ae73249c` |
| 17 | Luis (friend) lists "Random hostel (not on the leash)" at 25 USDC | Luis (friend) | `bookings.createListing` | 257,493 | `0xd5b5f8af33a08deb35231ffef801e797bfd828dda782e5200e707cd8bedf075c` |
| 18 | EmpowerTours approves Marisol as a perk partner | EmpowerTours/Hunt relayer (deployer) | `perks.setPartner` | 66,411 | `0x1f064ff78413760323b394c06117270c4ac1408063f1c551a8149fa7ce4b9f22` |
| 19 | Lumbre lists perk "Backstage pass · Lumbre live in Oaxaca" for 150 $TOURS | Lumbre (artist) | `perks.listPerk` | 212,797 | `0x699286ac39878ecd98efdcfc45aad7b2279d952ef29507ce1d83b5bd44b0978a` |
| 20 | Marisol Tours lists perk "10% off the Mezcal & Monte Albán tour" for 60 $TOURS | Marisol (local guide) | `perks.listPerk` | 194,015 | `0x2729445d7bd4ddb592f9340face10e89f5cd1c8a5fade98a98d51a5c5d51f233` |

## 1. Ana opens an Oaxaca trip vault with a leash; Luis chips in

| # | Action | From | Call | Gas | Tx hash |
|---|---|---|---|---|---|
| 21 | Ana creates trip "Oaxaca, MX · March 2027", goal 500 USDC, leash: 3 vendors, total cap 450 | Ana (traveler) | `factory.createVault` | 756,309 | `0xaaeb534b6105e621a1c4fd8d7c3b08e73d1d07203851bee9c1afb99577652c98` |
| 22 | Ana approves 200 USDC | Ana (traveler) | `usdc.approve` | 57,311 | `0x9df9ce08aa329b794f8d33e7a4773cf5f91a237098c54c2b80d3b2b01c4d3ea0` |
| 23 | Ana saves 200 USDC (auto-supplied to the lending pool) | Ana (traveler) | `TripVault.deposit` | 477,144 | `0x9bf0bab0b8a18b148e86ac57c653806f2557df172fd269569e09afc62e4ffb3e` |
| 24 | Luis approves 100 USDC | Luis (friend) | `usdc.approve` | 57,311 | `0x1756d450f60ed5bff7c796f45f727706f134b9d4c14891dc7a76f69fd2496516` |
| 25 | Luis chips in 100 USDC to Ana's trip | Luis (friend) | `TripVault.deposit` | 382,147 | `0xbb748bf4d05e5300580fb5c963a68fde81866970e92e606c365d3975e4afeae6` |

## 2. Twelve days of proved visits (Hunt GPS attestation) → rewards straight into the trip

| # | Action | From | Call | Gas | Tx hash |
|---|---|---|---|---|---|
| 26 | day 1: visit "Hunt cache · Jardín Etnobotánico" relayed (Ana pays no gas) | EmpowerTours/Hunt relayer (deployer) | `rewards.claim` | 612,101 | `0xc6ed9279947249ae382389a2cfb9b441f38c0fc85e4434d9ec4eb3e3c12f739e` |
| 27 | day 1: visit "Marisol's meeting point · Santo Domingo" relayed (Ana pays no gas) | EmpowerTours/Hunt relayer (deployer) | `rewards.claim` | 533,699 | `0x665b5b17fbfe66bac25f91575952fbfc9d57d099199a71bebc5af601c9cc9c5d` |
| 28 | day 2: visit "Hunt cache · Jardín Etnobotánico" relayed (Ana pays no gas) | EmpowerTours/Hunt relayer (deployer) | `rewards.claim` | 534,411 | `0x70a1f302f2b867dbc31d51b22419a37b78153aad0e35f169844919ddd74e2a8a` |
| 29 | day 2: visit "Marisol's meeting point · Santo Domingo" relayed (Ana pays no gas) | EmpowerTours/Hunt relayer (deployer) | `rewards.claim` | 533,699 | `0xe1d4edcc21cf43aed2d184d536a318e1eea5ef135c1194d8aee16930ef35d098` |
| 30 | day 3: visit "Hunt cache · Jardín Etnobotánico" relayed (Ana pays no gas) | EmpowerTours/Hunt relayer (deployer) | `rewards.claim` | 534,411 | `0x4b405a4ee6a96d7db5be92ce69c57d073c414500bfaa4afa76a7fb25ce6f058e` |
| 31 | day 3: visit "Lumbre mural · Calle Macedonio Alcalá" relayed (Ana pays no gas) | EmpowerTours/Hunt relayer (deployer) | `rewards.claim` | 533,699 | `0x79f7dcaec0a21e0885893b30e74f48e8733df92a07eda730f62489fc4d5f7558` |
| 32 | day 4: visit "Hunt cache · Jardín Etnobotánico" relayed (Ana pays no gas) | EmpowerTours/Hunt relayer (deployer) | `rewards.claim` | 534,398 | `0xb81ff59325bd0054264a05cd3040c3982ff11d2eb8b71dd321d4a131c70a5a11` |
| 33 | day 4: visit "Marisol's meeting point · Santo Domingo" relayed (Ana pays no gas) | EmpowerTours/Hunt relayer (deployer) | `rewards.claim` | 530,608 | `0xa0b9a1fdb0dd50cd7ff1ff5207552d11001b604bfb0c6b1752ba9df742e316c3` |
| 34 | day 5: visit "Hunt cache · Jardín Etnobotánico" relayed (Ana pays no gas) | EmpowerTours/Hunt relayer (deployer) | `rewards.claim` | 534,411 | `0x844d0557142063b824acb703cdb02c055975dbae830475603990b42b6898fcac` |
| 35 | day 5: visit "Marisol's meeting point · Santo Domingo" relayed (Ana pays no gas) | EmpowerTours/Hunt relayer (deployer) | `rewards.claim` | 533,699 | `0x913936bbb657ba65b0e88dccb7bb336f3f09cb328b828e38383720d82ef30ed9` |
| 36 | day 6: visit "Hunt cache · Jardín Etnobotánico" relayed (Ana pays no gas) | EmpowerTours/Hunt relayer (deployer) | `rewards.claim` | 534,398 | `0x97646994605b66b91cd46fd77659410a42aeb193f531333f605cc22536cb4408` |
| 37 | day 6: visit "Lumbre mural · Calle Macedonio Alcalá" relayed (Ana pays no gas) | EmpowerTours/Hunt relayer (deployer) | `rewards.claim` | 533,712 | `0x51fe4ca4f2850515dbfc6c81ff40b6f237057357ba86594cb675213835e4b06c` |
| 38 | day 7: visit "Hunt cache · Jardín Etnobotánico" relayed (Ana pays no gas) | EmpowerTours/Hunt relayer (deployer) | `rewards.claim` | 534,398 | `0xd852505863a36bfaaf346fe99309b8b18f7a1f7b05f564f03c425bfbaed35c71` |
| 39 | day 7: visit "Marisol's meeting point · Santo Domingo" relayed (Ana pays no gas) | EmpowerTours/Hunt relayer (deployer) | `rewards.claim` | 530,608 | `0x7427f56f0e9798296cdc7fc35933e8ce7e17405fadde139d28be33d79ea7bc24` |
| 40 | day 8: visit "Hunt cache · Jardín Etnobotánico" relayed (Ana pays no gas) | EmpowerTours/Hunt relayer (deployer) | `rewards.claim` | 537,517 | `0xeedb6c822be8b980f58aaa8fc070182158df4d7a254006c78ff0cbc132f0dd30` |
| 41 | day 8: visit "Marisol's meeting point · Santo Domingo" relayed (Ana pays no gas) | EmpowerTours/Hunt relayer (deployer) | `rewards.claim` | 530,608 | `0x43c43b3109f99f48d4dd27b5438aa3b4aa0828034307551f318ee109f0095270` |
| 42 | day 9: visit "Hunt cache · Jardín Etnobotánico" relayed (Ana pays no gas) | EmpowerTours/Hunt relayer (deployer) | `rewards.claim` | 537,517 | `0xe37f94504e1f1ee4344f14a11fbc3ef0456e55b9b155663412a5099beb9d7c9a` |
| 43 | day 9: visit "Lumbre mural · Calle Macedonio Alcalá" relayed (Ana pays no gas) | EmpowerTours/Hunt relayer (deployer) | `rewards.claim` | 530,608 | `0x89814b86dfb2576b4484643d760f5f9b4d63934bbfb617c969ab03956600c035` |
| 44 | day 10: visit "Hunt cache · Jardín Etnobotánico" relayed (Ana pays no gas) | EmpowerTours/Hunt relayer (deployer) | `rewards.claim` | 534,411 | `0x713b2dcbddf70a2e69cea8b468e809f6b590305b60bb60d4989a79ec1aa234c5` |
| 45 | day 10: visit "Marisol's meeting point · Santo Domingo" relayed (Ana pays no gas) | EmpowerTours/Hunt relayer (deployer) | `rewards.claim` | 530,608 | `0x5dd9ddb243a99288742fa24c815a98fae632b180990c6dfbe236ef2b49160de7` |
| 46 | day 10: visit "Lumbre live · Foro (Friday show)" relayed (Ana pays no gas) | EmpowerTours/Hunt relayer (deployer) | `rewards.claim` | 533,712 | `0xfeae768bfcd90efc2b3fce1bf2765f2d18009909b7df11067caa98206151ada3` |
| 47 | day 11: visit "Hunt cache · Jardín Etnobotánico" relayed (Ana pays no gas) | EmpowerTours/Hunt relayer (deployer) | `rewards.claim` | 537,504 | `0x116224093215a83938c326a04cce7ccb6eee96078dbe545d1dfde51f5a78db75` |
| 48 | day 11: visit "Marisol's meeting point · Santo Domingo" relayed (Ana pays no gas) | EmpowerTours/Hunt relayer (deployer) | `rewards.claim` | 530,594 | `0x43fa7811aebe60220b3ca81299482b328d04894cee82a754a4befbe513e4604e` |
| 49 | day 12: visit "Hunt cache · Jardín Etnobotánico" relayed (Ana pays no gas) | EmpowerTours/Hunt relayer (deployer) | `rewards.claim` | 534,411 | `0x65a50ed3ace3cb37a0208e118f9ee0bd5cdaf1bc3fb42ae1f4507e9487dcd239` |
| 50 | day 12: visit "Lumbre mural · Calle Macedonio Alcalá" relayed (Ana pays no gas) | EmpowerTours/Hunt relayer (deployer) | `rewards.claim` | 530,594 | `0x831d77ac2cf7c8598f456be5a7743041e92c421daf6aa55aac619373d340cb5f` |

## 3. Yield accrues; Ana and Luis back an artist; Ana redeems a perk with $TOURS

| # | Action | From | Call | Gas | Tx hash |
|---|---|---|---|---|---|
| 51 | DEMO ONLY: mock lending pool simulates 30 days of 5% APR (Solonet cannot warp time) | EmpowerTours/Hunt relayer (deployer) | `pool.fastForward` | 60,678 | `0x358b12dcc8481a0fd6c75433f403d412cbd39ea69a3c925592ffb5e2fde0e93f` |
| 52 | Lumbre opens a fan-backed tour vault (venue on the leash) | Lumbre (artist) | `factory.createVault` | 568,264 | `0xeb6b8d91635367d3203e1f082d402a07e0c7d6bd48967c4d6bf2f16ee175b330` |
| 53 | Luis approves 40 USDC | Luis (friend) | `usdc.approve` | 57,311 | `0x2d663b4f422ea827901ba8c925b1e4a17db9ba0dc20a50fdbfa71adc409df468` |
| 54 | Luis backs Lumbre's tour with 40 USDC (perks, not a revenue share) | Luis (friend) | `TripVault(artist).deposit` | 458,134 | `0x9ee9b0fdd3559ceddb787191825d2740e03ccf2d63eacdf5859672f9ddeba318` |
| 55 | Ana approves 20 USDC | Ana (traveler) | `usdc.approve` | 57,311 | `0x4437f520efe9573371ef787c4586be09afe691ddaa896141ba51f5063ff5037a` |
| 56 | Ana backs Lumbre's tour with 20 USDC | Ana (traveler) | `TripVault(artist).deposit` | 382,160 | `0xc30ef22f9134151da4eab661d6ca8396ec18626f7144d9b3cce5ed372eac0e20` |
| 57 | Ana approves PerkMarket for 150 $TOURS | Ana (traveler) | `tours.approve` | 57,388 | `0x2a3742ad1fda4aa8dbdbcede4df0e1461e40a99ebba362e9b893341386e8f3ae` |
| 58 | Ana redeems "Backstage pass · Lumbre live in Oaxaca" (150 $TOURS burned) | Ana (traveler) | `perks.redeem` | 238,002 | `0xd5124f38bb6e9ac525298119ab841794c117dbce8983cdff7650367bfcaa87a5` |

## 4. Trip window opens: the vault books a guide and a stay through escrow

| # | Action | From | Call | Gas | Tx hash |
|---|---|---|---|---|---|
| 59 | vault books Mezcal & Monte Albán tour for 2 (90 USDC into escrow) | Ana (traveler) | `TripVault.book` | 665,376 | `0x25e54fbfc7b9739a4d46f6388f0db4fc5716dc9a2a1d41402827912847fdaab4` |
| 60 | vault books 3 nights at Casa Azul (114 USDC into escrow) | Ana (traveler) | `TripVault.book` | 592,531 | `0x6c4a0b04991709d8d168c5794412844fbe2b5f49786167519c5b21bd9b566f29` |
| 61 | Casa Azul cancels → automatic full refund to the vault, leash allowance restored | Casa Azul (host) | `bookings.hostCancel` | 424,218 | `0x80e7084d708e5a6efd548a2be74e74980d3972b402ed7d27592234a285b0aa07` |
| 62 | vault re-books 3 nights at Casita Jalatlaco (126 USDC into escrow) | Ana (traveler) | `TripVault.book` | 573,534 | `0x17f415550ba6bbe85d579565c0487dd26796af597b3a0cfd2d52b13052d3a9f9` |
| 63 | Marisol submits the Hunt GPS check-in proof → tour escrow released (3% fee to treasury) | Marisol (local guide) | `bookings.confirmWithAttestation` | 495,959 | `0x4cebb4eb78c479cd87c31f751cf34d02677c8dcb0861d767233a3801a2b38f29` |
| 64 | Ana confirms check-in at Casita Jalatlaco → stay escrow released | Ana (traveler) | `TripVault.confirmCheckIn` | 512,641 | `0x402c1e6ba86848f36f08a5f72f098cb3f80f3f85fa3f716206478b18b75d7299` |
| 65 | Ana anchors her tour review (rating 5 + keccak256 of the text) | Ana (traveler) | `bookings.anchorReview` | 135,836 | `0x2b15642efe8497ea965799f29c04f9b8d70ca70c799aa1b2f42268b47a61a9f5` |
| 66 | Ana anchors her stay review | Ana (traveler) | `bookings.anchorReview` | 135,850 | `0x3ad0b97107ea2c302118612ed75e91dd19c82d1cd62c525f34ab80f87a36864f` |
| 67 | Lumbre pays the venue deposit from the tour vault (30 USDC, leashed) | Lumbre (artist) | `TripVault(artist).payVendor` | 258,198 | `0xc54403fc2a21aab523a03a24254b220d54d4553879339c816d54f5ffc919da95` |
| 68 | Luis claims backing $TOURS (unlocked by the share of tour money actually spent) | Luis (friend) | `rewards.claimBacking` | 211,403 | `0x77094ba72bb071feb7663ec5300a6a74d65394eb482a966da8e7f00e08f84947` |
