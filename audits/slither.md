**THIS CHECKLIST IS NOT COMPLETE**. Use `--show-ignored-findings` to show all the results.
Summary
 - [reentrancy-balance](#reentrancy-balance) (2 results) (High)
 - [uninitialized-state](#uninitialized-state) (1 results) (High)
 - [incorrect-equality](#incorrect-equality) (2 results) (Medium)
 - [uninitialized-local](#uninitialized-local) (2 results) (Medium)
 - [unused-return](#unused-return) (1 results) (Medium)
 - [events-maths](#events-maths) (1 results) (Low)
 - [missing-zero-check](#missing-zero-check) (4 results) (Low)
 - [calls-loop](#calls-loop) (1 results) (Low)
 - [reentrancy-benign](#reentrancy-benign) (2 results) (Low)
 - [reentrancy-events](#reentrancy-events) (3 results) (Low)
 - [timestamp](#timestamp) (23 results) (Low)
 - [missing-inheritance](#missing-inheritance) (1 results) (Informational)
 - [unindexed-event-address](#unindexed-event-address) (6 results) (Informational)
## reentrancy-balance
Impact: High
Confidence: Medium
 - [ ] ID-0
Reentrancy in [TripVault.bookVenue(uint256,uint64,uint128,uint32,string)](src/TripVault.sol#L332-L354):
	External call allowing reentrancy:
	- [showId = ven.bookShow(venueId,showTime,ticketPrice,maxTickets,title,dep)](src/TripVault.sol#L345)
	Balance read before the call:
	- [before = IERC20(asset).balanceOf(address(this))](src/TripVault.sol#L343)
	Possible stale balance used after the call in a condition:
	- [paid != dep](src/TripVault.sol#L348)
		- stale variable `paid`

src/TripVault.sol#L332-L354


 - [ ] ID-1
Reentrancy in [TripVault.book(uint256,uint32,uint64)](src/TripVault.sol#L311-L328):
	External call allowing reentrancy:
	- [bookingId = b.book(listingId,units,startAt,amount)](src/TripVault.sol#L319)
	Balance read before the call:
	- [before = IERC20(asset).balanceOf(address(this))](src/TripVault.sol#L317)
	Possible stale balance used after the call in a condition:
	- [paid != amount](src/TripVault.sol#L322)
		- stale variable `paid`

src/TripVault.sol#L311-L328


## uninitialized-state
Impact: High
Confidence: High
 - [ ] ID-2
[TourRewards._claimedBits](src/TourRewards.sol#L100) is never initialized. It is used in:
	- [TourRewards.claimedDay(address,uint256,uint256)](src/TourRewards.sol#L258-L260)
	- [TourRewards._consumeVisit(address,uint256,uint64)](src/TourRewards.sol#L326-L347)

src/TourRewards.sol#L100


## incorrect-equality
Impact: Medium
Confidence: High
 - [ ] ID-3
[TripVault.deposit(uint256,address)](src/TripVault.sol#L236-L255) uses a dangerous strict equality:
	- [shares == 0](src/TripVault.sol#L243)

src/TripVault.sol#L236-L255


 - [ ] ID-4
[TripVault._sweep()](src/TripVault.sol#L524-L531) uses a dangerous strict equality:
	- [idle == 0](src/TripVault.sol#L527)

src/TripVault.sol#L524-L531


## uninitialized-local
Impact: Medium
Confidence: Medium
 - [ ] ID-5
[TourRewards.claimBatch(TourRewards.VisitBatch,bytes).token](src/TourRewards.sol#L292) is a local variable never initialized

src/TourRewards.sol#L292


 - [ ] ID-6
[TourRewards.claimBatch(TourRewards.VisitBatch,bytes).prevAt](src/TourRewards.sol#L293) is a local variable never initialized

src/TourRewards.sol#L293


## unused-return
Impact: Medium
Confidence: Medium
 - [ ] ID-7
[TourRewards._payout(address,address,address,uint256)](src/TourRewards.sol#L366-L381) ignores return value by [ITripVault(vault).deposit(reward,user)](src/TourRewards.sol#L377)

src/TourRewards.sol#L366-L381


## events-maths
Impact: Low
Confidence: Medium
 - [ ] ID-8
[MockLendingPool.setApr(uint256)](src/mocks/MockLendingPool.sol#L84-L88) should emit an event for: 
	- [aprBps = bps](src/mocks/MockLendingPool.sol#L87) 

src/mocks/MockLendingPool.sol#L84-L88


## missing-zero-check
Impact: Low
Confidence: Medium
 - [ ] ID-9
[TripVault.initialize(address,TripVault.Config).factory_](src/TripVault.sol#L149) lacks a zero-check on :
		- [factory = factory_](src/TripVault.sol#L157)

src/TripVault.sol#L149


 - [ ] ID-10
[MockLendingPool.constructor(address,uint256,address).owner_](src/mocks/MockLendingPool.sol#L37) lacks a zero-check on :
		- [owner = owner_](src/mocks/MockLendingPool.sol#L40)

src/mocks/MockLendingPool.sol#L37


 - [ ] ID-11
[MockLendingPool.constructor(address,uint256,address).asset_](src/mocks/MockLendingPool.sol#L37) lacks a zero-check on :
		- [asset = asset_](src/mocks/MockLendingPool.sol#L38)

src/mocks/MockLendingPool.sol#L37


 - [ ] ID-12
[TripVault.setAgent(address).a](src/TripVault.sol#L486) lacks a zero-check on :
		- [agent = a](src/TripVault.sol#L487)

src/TripVault.sol#L486


## calls-loop
Impact: Low
Confidence: Medium
 - [ ] ID-13
[Tickets._refund(uint256,Tickets.Ticket)](src/Tickets.sol#L317-L322) has external calls inside a loop: [IERC20(venues.showInfo(t.showId).asset).safeTransfer(t.holder,t.price)](src/Tickets.sol#L320)
	Calls stack containing the loop:
		Tickets.refundAll(uint256,uint256)

src/Tickets.sol#L317-L322


## reentrancy-benign
Impact: Low
Confidence: Medium
 - [ ] ID-14
Reentrancy in [TripVault.bookVenue(uint256,uint64,uint128,uint32,string)](src/TripVault.sol#L332-L354):
	External calls:
	- [_ensureIdle(dep)](src/TripVault.sol#L342)
		- [adapter.withdraw(amount - idle,address(this))](src/TripVault.sol#L521)
	- [showId = ven.bookShow(venueId,showTime,ticketPrice,maxTickets,title,dep)](src/TripVault.sol#L345)
	State variables written after the call(s):
	- [++ openBookings](src/TripVault.sol#L352)
	- [showAmount[showId] = dep](src/TripVault.sol#L350)
	- [showOpen[showId] = true](src/TripVault.sol#L351)
	- [showVendor[showId] = venueOwner](src/TripVault.sol#L349)

src/TripVault.sol#L332-L354


 - [ ] ID-15
Reentrancy in [TripVault.book(uint256,uint32,uint64)](src/TripVault.sol#L311-L328):
	External calls:
	- [_ensureIdle(amount)](src/TripVault.sol#L316)
		- [adapter.withdraw(amount - idle,address(this))](src/TripVault.sol#L521)
	- [bookingId = b.book(listingId,units,startAt,amount)](src/TripVault.sol#L319)
	State variables written after the call(s):
	- [bookingAmount[bookingId] = amount](src/TripVault.sol#L324)
	- [bookingOpen[bookingId] = true](src/TripVault.sol#L325)
	- [bookingVendor[bookingId] = host](src/TripVault.sol#L323)
	- [++ openBookings](src/TripVault.sol#L326)

src/TripVault.sol#L311-L328


## reentrancy-events
Impact: Low
Confidence: Medium
 - [ ] ID-16
Reentrancy in [Venues._notify(uint256,address,uint256)](src/Venues.sol#L448-L453):
	External calls:
	- [ITripVault(payer).onShowSettled{gas: CALLBACK_GAS}(showId,refunded)](src/Venues.sol#L451-L452)
	Event emitted after the call(s):
	- [VaultCallbackFailed(showId)](src/Venues.sol#L452)

src/Venues.sol#L448-L453


 - [ ] ID-17
Reentrancy in [TripVaultFactory.createVault(TripVault.Config)](src/TripVaultFactory.sol#L66-L76):
	External calls:
	- [TripVault(vault).initialize(address(this),c)](src/TripVaultFactory.sol#L74)
	Event emitted after the call(s):
	- [VaultCreated(vault,msg.sender,c.destination,c.goal,c.startTime)](src/TripVaultFactory.sol#L75)

src/TripVaultFactory.sol#L66-L76


 - [ ] ID-18
Reentrancy in [Bookings._notify(uint256,address,bool,uint256)](src/Bookings.sol#L390-L396):
	External calls:
	- [ITripVault(payer).onBookingSettled{gas: CALLBACK_GAS}(id,refunded,amount)](src/Bookings.sol#L394-L395)
	Event emitted after the call(s):
	- [VaultCallbackFailed(id)](src/Bookings.sol#L395)

src/Bookings.sol#L390-L396


## timestamp
Impact: Low
Confidence: Medium
 - [ ] ID-19
[TripVault.withdraw(uint256)](src/TripVault.sol#L271-L287) uses timestamp for comparisons
	Dangerous comparisons:
	- [! cancelled && block.timestamp >= endTime && openBookings != 0](src/TripVault.sol#L273)

src/TripVault.sol#L271-L287


 - [ ] ID-20
[Bookings.confirmCheckIn(uint256)](src/Bookings.sol#L312-L317) uses timestamp for comparisons
	Dangerous comparisons:
	- [block.timestamp < b.startAt](src/Bookings.sol#L315)

src/Bookings.sol#L312-L317


 - [ ] ID-21
[TripVault.applyTotalCap()](src/TripVault.sol#L477-L484) uses timestamp for comparisons
	Dangerous comparisons:
	- [block.timestamp < p.eta](src/TripVault.sol#L480)

src/TripVault.sol#L477-L484


 - [ ] ID-22
[Tickets.scan(uint256,uint64,bytes)](src/Tickets.sol#L172-L186) uses timestamp for comparisons
	Dangerous comparisons:
	- [at + 21600 < s.showTime || at > s.showTime + 86400 || at > block.timestamp](src/Tickets.sol#L178)

src/Tickets.sol#L172-L186


 - [ ] ID-23
[Bookings.confirmWithAttestation(uint256,uint64,bytes)](src/Bookings.sol#L320-L326) uses timestamp for comparisons
	Dangerous comparisons:
	- [block.timestamp < b.startAt || at < b.startAt || at > block.timestamp](src/Bookings.sol#L322)

src/Bookings.sol#L320-L326


 - [ ] ID-24
[Venues.claimArtistNoShow(uint256,uint64,bytes)](src/Venues.sol#L409-L418) uses timestamp for comparisons
	Dangerous comparisons:
	- [at < s.showTime || at > block.timestamp](src/Venues.sol#L413)

src/Venues.sol#L409-L418


 - [ ] ID-25
[TourRewards._consumeVisit(address,uint256,uint64)](src/TourRewards.sol#L326-L347) uses timestamp for comparisons
	Dangerous comparisons:
	- [visitedAt > block.timestamp](src/TourRewards.sol#L330)
	- [uint256(visitedAt) + maxClaimDelay < block.timestamp](src/TourRewards.sol#L331)

src/TourRewards.sol#L326-L347


 - [ ] ID-26
[TripVault.applyVendorCap(address)](src/TripVault.sol#L459-L467) uses timestamp for comparisons
	Dangerous comparisons:
	- [block.timestamp < p.eta](src/TripVault.sol#L462)

src/TripVault.sol#L459-L467


 - [ ] ID-27
[Venues.openSales(uint256,uint128,uint32,string)](src/Venues.sol#L338-L351) uses timestamp for comparisons
	Dangerous comparisons:
	- [block.timestamp >= s.showTime](src/Venues.sol#L343)

src/Venues.sol#L338-L351


 - [ ] ID-28
[TripVault.initialize(address,TripVault.Config)](src/TripVault.sol#L149-L175) uses timestamp for comparisons
	Dangerous comparisons:
	- [c.owner == address(0) || c.asset == address(0) || c.endTime <= c.startTime || c.endTime <= block.timestamp || c.goal == 0 || c.vendors.length != c.vendorCaps.length || c.vendors.length > MAX_VENDORS](src/TripVault.sol#L153-L154)

src/TripVault.sol#L149-L175


 - [ ] ID-29
[Venues.expire(uint256)](src/Venues.sol#L421-L427) uses timestamp for comparisons
	Dangerous comparisons:
	- [block.timestamp <= uint256(s.showTime) + s.resolveTimeout](src/Venues.sol#L424)

src/Venues.sol#L421-L427


 - [ ] ID-30
[Venues.artistCancel(uint256)](src/Venues.sol#L397-L406) uses timestamp for comparisons
	Dangerous comparisons:
	- [block.timestamp >= s.showTime](src/Venues.sol#L401)

src/Venues.sol#L397-L406


 - [ ] ID-31
[TripVault.isClosed()](src/TripVault.sol#L228-L230) uses timestamp for comparisons
	Dangerous comparisons:
	- [cancelled || (block.timestamp >= endTime && openBookings == 0)](src/TripVault.sol#L229)

src/TripVault.sol#L228-L230


 - [ ] ID-32
[TripVault.acceptsDeposits(address)](src/TripVault.sol#L224-L226) uses timestamp for comparisons
	Dangerous comparisons:
	- [! cancelled && block.timestamp < endTime && (open || beneficiary == owner)](src/TripVault.sol#L225)

src/TripVault.sol#L224-L226


 - [ ] ID-33
[Venues.bookShow(uint256,uint64,uint128,uint32,string,uint256)](src/Venues.sol#L297-L333) uses timestamp for comparisons
	Dangerous comparisons:
	- [showTime <= block.timestamp || showTime > block.timestamp + MAX_ADVANCE](src/Venues.sol#L305)

src/Venues.sol#L297-L333


 - [ ] ID-34
[TripVault.canWithdraw(address)](src/TripVault.sol#L262-L268) uses timestamp for comparisons
	Dangerous comparisons:
	- [block.timestamp < startTime](src/TripVault.sol#L265)
	- [lastLoosenAt > lastDepositAt[c]](src/TripVault.sol#L267)

src/TripVault.sol#L262-L268


 - [ ] ID-35
[Bookings.book(uint256,uint32,uint64,uint256)](src/Bookings.sol#L289-L309) uses timestamp for comparisons
	Dangerous comparisons:
	- [startAt + 3600 < block.timestamp || startAt > block.timestamp + MAX_ADVANCE](src/Bookings.sol#L296)

src/Bookings.sol#L289-L309


 - [ ] ID-36
[Tickets.buy(uint256,uint32,uint256)](src/Tickets.sol#L144-L169) uses timestamp for comparisons
	Dangerous comparisons:
	- [s.status != IVenues.ShowStatus.Booked || block.timestamp >= s.showTime || s.ticketPrice == 0](src/Tickets.sol#L146)

src/Tickets.sol#L144-L169


 - [ ] ID-37
[MockLendingPool.withdraw(uint256,address)](src/mocks/MockLendingPool.sol#L68-L78) uses timestamp for comparisons
	Dangerous comparisons:
	- [scaled > bal](src/mocks/MockLendingPool.sol#L73)

src/mocks/MockLendingPool.sol#L68-L78


 - [ ] ID-38
[Bookings.claimNoShowRefund(uint256)](src/Bookings.sol#L343-L347) uses timestamp for comparisons
	Dangerous comparisons:
	- [block.timestamp <= uint256(b.startAt) + b.noShowTimeout](src/Bookings.sol#L345)

src/Bookings.sol#L343-L347


 - [ ] ID-39
[TourRewards.sourceCheckIn(address,uint64,uint256)](src/TourRewards.sol#L314-L324) uses timestamp for comparisons
	Dangerous comparisons:
	- [at > block.timestamp](src/TourRewards.sol#L316)
	- [uint256(at) + maxClaimDelay < block.timestamp](src/TourRewards.sol#L317)

src/TourRewards.sol#L314-L324


 - [ ] ID-40
[Venues.confirmShow(uint256,uint64,bytes)](src/Venues.sol#L372-L387) uses timestamp for comparisons
	Dangerous comparisons:
	- [at + 3600 < s.showTime || at > block.timestamp](src/Venues.sol#L376)

src/Venues.sol#L372-L387


 - [ ] ID-41
[TripVault.deposit(uint256,address)](src/TripVault.sol#L236-L255) uses timestamp for comparisons
	Dangerous comparisons:
	- [cancelled || block.timestamp >= endTime](src/TripVault.sol#L238)

src/TripVault.sol#L236-L255


## missing-inheritance
Impact: Informational
Confidence: High
 - [ ] ID-42
[Bookings](src/Bookings.sol#L27-L424) should inherit from [IBookings](src/interfaces/ITripVault.sol#L30-L36)

src/Bookings.sol#L27-L424


## unindexed-event-address
Impact: Informational
Confidence: High
 - [ ] ID-43
Event [TourRewards.ConfigSet(address,uint16,uint64,uint128,uint128,uint32)](src/TourRewards.sol#L120) has address parameters but no indexed parameters

src/TourRewards.sol#L120


 - [ ] ID-44
Event [Tickets.ConfigSet(address,uint16,uint128)](src/Tickets.sol#L83) has address parameters but no indexed parameters

src/Tickets.sol#L83


 - [ ] ID-45
Event [TripVaultFactory.Wired(address,address)](src/TripVaultFactory.sol#L28) has address parameters but no indexed parameters

src/TripVaultFactory.sol#L28


 - [ ] ID-46
Event [Venues.ConfigSet(address,uint16,uint64)](src/Venues.sol#L111) has address parameters but no indexed parameters

src/Venues.sol#L111


 - [ ] ID-47
Event [TripVaultFactory.VenuesWired(address)](src/TripVaultFactory.sol#L29) has address parameters but no indexed parameters

src/TripVaultFactory.sol#L29


 - [ ] ID-48
Event [Bookings.ConfigSet(address,uint16,uint64)](src/Bookings.sol#L99) has address parameters but no indexed parameters

src/Bookings.sol#L99


