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
 - [timestamp](#timestamp) (22 results) (Low)
 - [missing-inheritance](#missing-inheritance) (1 results) (Informational)
 - [unindexed-event-address](#unindexed-event-address) (6 results) (Informational)
## reentrancy-balance
Impact: High
Confidence: Medium
 - [ ] ID-0
Reentrancy in [TripVault.bookVenue(uint256,uint64,uint128,uint32,string)](../contracts/src/TripVault.sol#L332-L354):
	External call allowing reentrancy:
	- [showId = ven.bookShow(venueId,showTime,ticketPrice,maxTickets,title,dep)](../contracts/src/TripVault.sol#L345)
	Balance read before the call:
	- [before = IERC20(asset).balanceOf(address(this))](../contracts/src/TripVault.sol#L343)
	Possible stale balance used after the call in a condition:
	- [paid != dep](../contracts/src/TripVault.sol#L348)
		- stale variable `paid`

src/TripVault.sol#L332-L354


 - [ ] ID-1
Reentrancy in [TripVault.book(uint256,uint32,uint64)](../contracts/src/TripVault.sol#L311-L328):
	External call allowing reentrancy:
	- [bookingId = b.book(listingId,units,startAt,amount)](../contracts/src/TripVault.sol#L319)
	Balance read before the call:
	- [before = IERC20(asset).balanceOf(address(this))](../contracts/src/TripVault.sol#L317)
	Possible stale balance used after the call in a condition:
	- [paid != amount](../contracts/src/TripVault.sol#L322)
		- stale variable `paid`

src/TripVault.sol#L311-L328


## uninitialized-state
Impact: High
Confidence: High
 - [ ] ID-2
[TourRewards._claimedBits](../contracts/src/TourRewards.sol#L100) is never initialized. It is used in:
	- [TourRewards.claimedDay(address,uint256,uint256)](../contracts/src/TourRewards.sol#L258-L260)
	- [TourRewards._consumeVisit(address,uint256,uint64)](../contracts/src/TourRewards.sol#L326-L347)

src/TourRewards.sol#L100


## incorrect-equality
Impact: Medium
Confidence: High
 - [ ] ID-3
[TripVault.deposit(uint256,address)](../contracts/src/TripVault.sol#L236-L255) uses a dangerous strict equality:
	- [shares == 0](../contracts/src/TripVault.sol#L243)

src/TripVault.sol#L236-L255


 - [ ] ID-4
[TripVault._sweep()](../contracts/src/TripVault.sol#L524-L531) uses a dangerous strict equality:
	- [idle == 0](../contracts/src/TripVault.sol#L527)

src/TripVault.sol#L524-L531


## uninitialized-local
Impact: Medium
Confidence: Medium
 - [ ] ID-5
[TourRewards.claimBatch(TourRewards.VisitBatch,bytes).token](../contracts/src/TourRewards.sol#L292) is a local variable never initialized

src/TourRewards.sol#L292


 - [ ] ID-6
[TourRewards.claimBatch(TourRewards.VisitBatch,bytes).prevAt](../contracts/src/TourRewards.sol#L293) is a local variable never initialized

src/TourRewards.sol#L293


## unused-return
Impact: Medium
Confidence: Medium
 - [ ] ID-7
[TourRewards._payout(address,address,address,uint256)](../contracts/src/TourRewards.sol#L366-L381) ignores return value by [ITripVault(vault).deposit(reward,user)](../contracts/src/TourRewards.sol#L377)

src/TourRewards.sol#L366-L381


## events-maths
Impact: Low
Confidence: Medium
 - [ ] ID-8
[MockLendingPool.setApr(uint256)](../contracts/src/mocks/MockLendingPool.sol#L84-L88) should emit an event for: 
	- [aprBps = bps](../contracts/src/mocks/MockLendingPool.sol#L87) 

src/mocks/MockLendingPool.sol#L84-L88


## missing-zero-check
Impact: Low
Confidence: Medium
 - [ ] ID-9
[TripVault.initialize(address,TripVault.Config).factory_](../contracts/src/TripVault.sol#L149) lacks a zero-check on :
		- [factory = factory_](../contracts/src/TripVault.sol#L157)

src/TripVault.sol#L149


 - [ ] ID-10
[MockLendingPool.constructor(address,uint256,address).owner_](../contracts/src/mocks/MockLendingPool.sol#L37) lacks a zero-check on :
		- [owner = owner_](../contracts/src/mocks/MockLendingPool.sol#L40)

src/mocks/MockLendingPool.sol#L37


 - [ ] ID-11
[MockLendingPool.constructor(address,uint256,address).asset_](../contracts/src/mocks/MockLendingPool.sol#L37) lacks a zero-check on :
		- [asset = asset_](../contracts/src/mocks/MockLendingPool.sol#L38)

src/mocks/MockLendingPool.sol#L37


 - [ ] ID-12
[TripVault.setAgent(address).a](../contracts/src/TripVault.sol#L486) lacks a zero-check on :
		- [agent = a](../contracts/src/TripVault.sol#L487)

src/TripVault.sol#L486


## calls-loop
Impact: Low
Confidence: Medium
 - [ ] ID-13
[Tickets._refund(uint256,Tickets.Ticket)](../contracts/src/Tickets.sol#L317-L322) has external calls inside a loop: [IERC20(venues.showInfo(t.showId).asset).safeTransfer(t.holder,t.price)](../contracts/src/Tickets.sol#L320)
	Calls stack containing the loop:
		Tickets.refundAll(uint256,uint256)

src/Tickets.sol#L317-L322


## reentrancy-benign
Impact: Low
Confidence: Medium
 - [ ] ID-14
Reentrancy in [TripVault.bookVenue(uint256,uint64,uint128,uint32,string)](../contracts/src/TripVault.sol#L332-L354):
	External calls:
	- [_ensureIdle(dep)](../contracts/src/TripVault.sol#L342)
		- [adapter.withdraw(amount - idle,address(this))](../contracts/src/TripVault.sol#L521)
	- [showId = ven.bookShow(venueId,showTime,ticketPrice,maxTickets,title,dep)](../contracts/src/TripVault.sol#L345)
	State variables written after the call(s):
	- [++ openBookings](../contracts/src/TripVault.sol#L352)
	- [showAmount[showId] = dep](../contracts/src/TripVault.sol#L350)
	- [showOpen[showId] = true](../contracts/src/TripVault.sol#L351)
	- [showVendor[showId] = venueOwner](../contracts/src/TripVault.sol#L349)

src/TripVault.sol#L332-L354


 - [ ] ID-15
Reentrancy in [TripVault.book(uint256,uint32,uint64)](../contracts/src/TripVault.sol#L311-L328):
	External calls:
	- [_ensureIdle(amount)](../contracts/src/TripVault.sol#L316)
		- [adapter.withdraw(amount - idle,address(this))](../contracts/src/TripVault.sol#L521)
	- [bookingId = b.book(listingId,units,startAt,amount)](../contracts/src/TripVault.sol#L319)
	State variables written after the call(s):
	- [bookingAmount[bookingId] = amount](../contracts/src/TripVault.sol#L324)
	- [bookingOpen[bookingId] = true](../contracts/src/TripVault.sol#L325)
	- [bookingVendor[bookingId] = host](../contracts/src/TripVault.sol#L323)
	- [++ openBookings](../contracts/src/TripVault.sol#L326)

src/TripVault.sol#L311-L328


## reentrancy-events
Impact: Low
Confidence: Medium
 - [ ] ID-16
Reentrancy in [Venues._notify(uint256,address,uint256)](../contracts/src/Venues.sol#L374-L379):
	External calls:
	- [ITripVault(payer).onShowSettled{gas: CALLBACK_GAS}(showId,refunded)](../contracts/src/Venues.sol#L377-L378)
	Event emitted after the call(s):
	- [VaultCallbackFailed(showId)](../contracts/src/Venues.sol#L378)

src/Venues.sol#L374-L379


 - [ ] ID-17
Reentrancy in [Bookings._notify(uint256,address,bool,uint256)](../contracts/src/Bookings.sol#L312-L318):
	External calls:
	- [ITripVault(payer).onBookingSettled{gas: CALLBACK_GAS}(id,refunded,amount)](../contracts/src/Bookings.sol#L316-L317)
	Event emitted after the call(s):
	- [VaultCallbackFailed(id)](../contracts/src/Bookings.sol#L317)

src/Bookings.sol#L312-L318


 - [ ] ID-18
Reentrancy in [TripVaultFactory.createVault(TripVault.Config)](../contracts/src/TripVaultFactory.sol#L66-L76):
	External calls:
	- [TripVault(vault).initialize(address(this),c)](../contracts/src/TripVaultFactory.sol#L74)
	Event emitted after the call(s):
	- [VaultCreated(vault,msg.sender,c.destination,c.goal,c.startTime)](../contracts/src/TripVaultFactory.sol#L75)

src/TripVaultFactory.sol#L66-L76


## timestamp
Impact: Low
Confidence: Medium
 - [ ] ID-19
[Bookings.confirmWithAttestation(uint256,uint64,bytes)](../contracts/src/Bookings.sol#L242-L248) uses timestamp for comparisons
	Dangerous comparisons:
	- [block.timestamp < b.startAt || at < b.startAt || at > block.timestamp](../contracts/src/Bookings.sol#L244)

src/Bookings.sol#L242-L248


 - [ ] ID-20
[TripVault.withdraw(uint256)](../contracts/src/TripVault.sol#L271-L287) uses timestamp for comparisons
	Dangerous comparisons:
	- [! cancelled && block.timestamp >= endTime && openBookings != 0](../contracts/src/TripVault.sol#L273)

src/TripVault.sol#L271-L287


 - [ ] ID-21
[TripVault.applyTotalCap()](../contracts/src/TripVault.sol#L477-L484) uses timestamp for comparisons
	Dangerous comparisons:
	- [block.timestamp < p.eta](../contracts/src/TripVault.sol#L480)

src/TripVault.sol#L477-L484


 - [ ] ID-22
[Venues.bookShow(uint256,uint64,uint128,uint32,string,uint256)](../contracts/src/Venues.sol#L241-L277) uses timestamp for comparisons
	Dangerous comparisons:
	- [showTime <= block.timestamp || showTime > block.timestamp + MAX_ADVANCE](../contracts/src/Venues.sol#L249)

src/Venues.sol#L241-L277


 - [ ] ID-23
[Venues.confirmShow(uint256,uint64,bytes)](../contracts/src/Venues.sol#L298-L313) uses timestamp for comparisons
	Dangerous comparisons:
	- [at + 3600 < s.showTime || at > block.timestamp](../contracts/src/Venues.sol#L302)

src/Venues.sol#L298-L313


 - [ ] ID-24
[Tickets.scan(uint256,uint64,bytes)](../contracts/src/Tickets.sol#L172-L186) uses timestamp for comparisons
	Dangerous comparisons:
	- [at + 21600 < s.showTime || at > s.showTime + 86400 || at > block.timestamp](../contracts/src/Tickets.sol#L178)

src/Tickets.sol#L172-L186


 - [ ] ID-25
[Bookings.book(uint256,uint32,uint64,uint256)](../contracts/src/Bookings.sol#L211-L231) uses timestamp for comparisons
	Dangerous comparisons:
	- [startAt + 3600 < block.timestamp || startAt > block.timestamp + MAX_ADVANCE](../contracts/src/Bookings.sol#L218)

src/Bookings.sol#L211-L231


 - [ ] ID-26
[TourRewards._consumeVisit(address,uint256,uint64)](../contracts/src/TourRewards.sol#L326-L347) uses timestamp for comparisons
	Dangerous comparisons:
	- [visitedAt > block.timestamp](../contracts/src/TourRewards.sol#L330)
	- [uint256(visitedAt) + maxClaimDelay < block.timestamp](../contracts/src/TourRewards.sol#L331)

src/TourRewards.sol#L326-L347


 - [ ] ID-27
[Venues.expire(uint256)](../contracts/src/Venues.sol#L347-L353) uses timestamp for comparisons
	Dangerous comparisons:
	- [block.timestamp <= uint256(s.showTime) + s.resolveTimeout](../contracts/src/Venues.sol#L350)

src/Venues.sol#L347-L353


 - [ ] ID-28
[TripVault.applyVendorCap(address)](../contracts/src/TripVault.sol#L459-L467) uses timestamp for comparisons
	Dangerous comparisons:
	- [block.timestamp < p.eta](../contracts/src/TripVault.sol#L462)

src/TripVault.sol#L459-L467


 - [ ] ID-29
[TripVault.initialize(address,TripVault.Config)](../contracts/src/TripVault.sol#L149-L175) uses timestamp for comparisons
	Dangerous comparisons:
	- [c.owner == address(0) || c.asset == address(0) || c.endTime <= c.startTime || c.endTime <= block.timestamp || c.goal == 0 || c.vendors.length != c.vendorCaps.length || c.vendors.length > MAX_VENDORS](../contracts/src/TripVault.sol#L153-L154)

src/TripVault.sol#L149-L175


 - [ ] ID-30
[Bookings.claimNoShowRefund(uint256)](../contracts/src/Bookings.sol#L265-L269) uses timestamp for comparisons
	Dangerous comparisons:
	- [block.timestamp <= uint256(b.startAt) + b.noShowTimeout](../contracts/src/Bookings.sol#L267)

src/Bookings.sol#L265-L269


 - [ ] ID-31
[Venues.artistCancel(uint256)](../contracts/src/Venues.sol#L323-L332) uses timestamp for comparisons
	Dangerous comparisons:
	- [block.timestamp >= s.showTime](../contracts/src/Venues.sol#L327)

src/Venues.sol#L323-L332


 - [ ] ID-32
[TripVault.isClosed()](../contracts/src/TripVault.sol#L228-L230) uses timestamp for comparisons
	Dangerous comparisons:
	- [cancelled || (block.timestamp >= endTime && openBookings == 0)](../contracts/src/TripVault.sol#L229)

src/TripVault.sol#L228-L230


 - [ ] ID-33
[TripVault.acceptsDeposits(address)](../contracts/src/TripVault.sol#L224-L226) uses timestamp for comparisons
	Dangerous comparisons:
	- [! cancelled && block.timestamp < endTime && (open || beneficiary == owner)](../contracts/src/TripVault.sol#L225)

src/TripVault.sol#L224-L226


 - [ ] ID-34
[Bookings.confirmCheckIn(uint256)](../contracts/src/Bookings.sol#L234-L239) uses timestamp for comparisons
	Dangerous comparisons:
	- [block.timestamp < b.startAt](../contracts/src/Bookings.sol#L237)

src/Bookings.sol#L234-L239


 - [ ] ID-35
[TripVault.canWithdraw(address)](../contracts/src/TripVault.sol#L262-L268) uses timestamp for comparisons
	Dangerous comparisons:
	- [block.timestamp < startTime](../contracts/src/TripVault.sol#L265)
	- [lastLoosenAt > lastDepositAt[c]](../contracts/src/TripVault.sol#L267)

src/TripVault.sol#L262-L268


 - [ ] ID-36
[Venues.claimArtistNoShow(uint256,uint64,bytes)](../contracts/src/Venues.sol#L335-L344) uses timestamp for comparisons
	Dangerous comparisons:
	- [at < s.showTime || at > block.timestamp](../contracts/src/Venues.sol#L339)

src/Venues.sol#L335-L344


 - [ ] ID-37
[Tickets.buy(uint256,uint32,uint256)](../contracts/src/Tickets.sol#L144-L169) uses timestamp for comparisons
	Dangerous comparisons:
	- [s.status != IVenues.ShowStatus.Booked || block.timestamp >= s.showTime || s.ticketPrice == 0](../contracts/src/Tickets.sol#L146)

src/Tickets.sol#L144-L169


 - [ ] ID-38
[MockLendingPool.withdraw(uint256,address)](../contracts/src/mocks/MockLendingPool.sol#L68-L78) uses timestamp for comparisons
	Dangerous comparisons:
	- [scaled > bal](../contracts/src/mocks/MockLendingPool.sol#L73)

src/mocks/MockLendingPool.sol#L68-L78


 - [ ] ID-39
[TourRewards.sourceCheckIn(address,uint64,uint256)](../contracts/src/TourRewards.sol#L314-L324) uses timestamp for comparisons
	Dangerous comparisons:
	- [at > block.timestamp](../contracts/src/TourRewards.sol#L316)
	- [uint256(at) + maxClaimDelay < block.timestamp](../contracts/src/TourRewards.sol#L317)

src/TourRewards.sol#L314-L324


 - [ ] ID-40
[TripVault.deposit(uint256,address)](../contracts/src/TripVault.sol#L236-L255) uses timestamp for comparisons
	Dangerous comparisons:
	- [cancelled || block.timestamp >= endTime](../contracts/src/TripVault.sol#L238)

src/TripVault.sol#L236-L255


## missing-inheritance
Impact: Informational
Confidence: High
 - [ ] ID-41
[Bookings](../contracts/src/Bookings.sol#L27-L346) should inherit from [IBookings](../contracts/src/interfaces/ITripVault.sol#L30-L36)

src/Bookings.sol#L27-L346


## unindexed-event-address
Impact: Informational
Confidence: High
 - [ ] ID-42
Event [TourRewards.ConfigSet(address,uint16,uint64,uint128,uint128,uint32)](../contracts/src/TourRewards.sol#L120) has address parameters but no indexed parameters

src/TourRewards.sol#L120


 - [ ] ID-43
Event [Tickets.ConfigSet(address,uint16,uint128)](../contracts/src/Tickets.sol#L83) has address parameters but no indexed parameters

src/Tickets.sol#L83


 - [ ] ID-44
Event [TripVaultFactory.Wired(address,address)](../contracts/src/TripVaultFactory.sol#L28) has address parameters but no indexed parameters

src/TripVaultFactory.sol#L28


 - [ ] ID-45
Event [Venues.ConfigSet(address,uint16,uint64)](../contracts/src/Venues.sol#L108) has address parameters but no indexed parameters

src/Venues.sol#L108


 - [ ] ID-46
Event [TripVaultFactory.VenuesWired(address)](../contracts/src/TripVaultFactory.sol#L29) has address parameters but no indexed parameters

src/TripVaultFactory.sol#L29


 - [ ] ID-47
Event [Bookings.ConfigSet(address,uint16,uint64)](../contracts/src/Bookings.sol#L94) has address parameters but no indexed parameters

src/Bookings.sol#L94


