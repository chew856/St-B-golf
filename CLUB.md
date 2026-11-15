# St. Boniface Golf Club: content reference

Everything here is taken from stbonifacegolfclub.com (October 2026). Use it for all names, copy and demo data.
**Do not invent facts about the real club** (no made-up history, awards, hole names, prices, people or emails).
Where the system needs a value the club doesn't publish (dues, cart fees, hours), use a sensible placeholder and keep
the wording neutral, or say "call the club office".

## Identity
- Name: **St. Boniface Golf Club** (short: St. Boniface, or St. B in casual copy, e.g. "St. B Crunch Wrap")
- Established **1931**. Logo: the St.B oak tree, "Established 1931".
- Tagline: **"The private club experience without the private club price!"** Also: "Private Club Experience".
- Address: 100 Youville Street, Winnipeg, Manitoba. Phone: 204-233-2497. Emails are not published.
- Mission (paraphrase for copy): a recreation facility offering an atmosphere of social enjoyment for all ages; a
  competitive, affordable course; comfortable clubhouse and pro shop; value-added service; a sense of belonging.
- Land acknowledgement: the club is on Treaty One lands (full text in `Club.info.landAcknowledgement`).
- Social: Facebook /stbgolf, Instagram @stbonifacegolfclub, YouTube. Weddings site: stbonifaceevents.com.
- Voice: warm, welcoming, community-minded, unpretentious but polished. Not "exclusive" or "luxury"; St. B is a
  friendly, established Winnipeg club. Canadian spelling (colour, centre, favourite, cheque). Currency CAD.
  Tax: Manitoba 5% GST + 7% PST (`Club.taxRate()` = 0.12). Weather in °C and km/h.

## Course
- "Built in 1931, St. Boniface Golf Club is a majestic traditional style golf course with tree-lined fairways",
  small, sloping greens, strategically placed bunkers and water hazards. "Classic par-72 with tree-lined fairways and
  subtle greens."
- Tees: **Black** (6,348 yds), **Green** (6,104), **Silver** (5,719); combination tees Black/Green (6,214) and
  Green/Silver (5,799). Men's par 72 (36/36). The `holes` collection has the real scorecard
  (`yards: { black, green, silver }`). Hole names are not published: holes are "Hole 1"…"Hole 18".
- Signature hole: **the par-5 17th**, "With the Seine River running along the entire hole and plenty of trees along
  the right side. Two bunkers await most balls that are heading for the putting surface, while the river is there to
  catch any errant shots that are heading left. The green is sloped from back to front." (Stroke index 1.)
- Dress code must be adhered to by members and guests. Soft spikes only on the course and in the clubhouse.
- Practice: short game practice facility; SIM teaching technology (simulator).

## Golf operations
- Public golf: "Book your Tee Time 7 days in advance!" Green fees (tax incl.): Monday to Thursday 10:30am to 3:30pm
  $66; weekdays after 5:30pm (twilight, price not published); weekends & holidays 6am to 1pm $76 with a member;
  weekends & holidays after 1pm $76. Members' guests pay the green fee. Cart fee not published (placeholder).
- Friday member play and beverage pricing. Members' league. Club events.
- Tournament & Corporate Services: "Packages for groups of all sizes".
- Junior Golf program. CPGA professional staff.

## Membership (`membershipTiers`, IDs are fixed, names/descriptions already updated in store.js)
| ID | Name | Play | Advance booking |
|---|---|---|---|
| tier_founders | Eagle | Unlimited golf, 7 days a week. Club storage, private locker | 15 days |
| tier_full | Birdie | Weekdays before 7:30am, 10:30am to 4pm, after 5:30pm; weekends after 10:30am | 13 days |
| tier_junior | Young Adult (19 to 23) | Weekdays 10:30am to 4pm and after 5:30pm; weekends after 11am | 8 days |
| tier_nonresident | Junior (under 18) | Weekdays 10:30am to 4pm and after 5:30pm; weekends after 11am | 8 days |
| tier_social | Social | System-only non-golf category (not on the website) | none |
- Benefits: unlimited season golf, club storage and cleaning, pull cart, private locker rooms, towel service, SIM
  teaching technology, short game practice facility, Pro Shop discounts, advance booking, Friday member play and
  beverage pricing, CPGA professional staff, members' league, club events, Gallery Taphouse member pricing, reduced
  meeting room rates.
- New member bonus: one-time credit of 50% of annual dues for first-time members (25% for club purchases in the first
  season, 25% toward the share and initiation fee in year two). Share fee $100 and initiation fee $250 (+GST), waived
  for first-time members in year one. Yearly dues can be paid in instalments from sign-up until August.
- "Becoming a member of St. Boniface Golf Club is now more affordable than ever!" Junior and Young Adult categories are
  currently full.
- No monthly food and beverage minimums are published (tiers have `monthlyMinimum: 0`).

## Clubhouse
- **The Gallery Taphouse & Grill**: "Situated on the second floor of the St. Boniface clubhouse, The Gallery
  Taphouse & Grill is the perfect dining setting. Overlooking the 18th hole, The Gallery offers a diverse menu in a
  casual and relaxing atmosphere suitable for every taste." "6 LOCAL beers on tap, including a House feature tap,
  weekly features created by Executive Chef Ian Wong, and our famous Friday night Pizza Menu." "Join us daily for
  breakfast, lunch, or dinner as we offer extended hours during our golf season." Breakfast served until 2:00 pm.
- **Golf Shop** (pro shop).
- **Weddings & Special Events**: year-round, all-inclusive packages, seating for 220 guests, complimentary parking,
  "a relaxing & stress-free environment for your celebration!", one of Winnipeg's most established wedding venues.
- Meeting rooms (members get reduced rates).

## Gallery Taphouse & Grill menu (2026, CAD)
Breakfast (served until 2pm), Breakfast entrees: One Egg Breakfast 12 (one egg any style, choice of bacon, ham or
sausage, and toast; served with tater tots or shredded hashbrowns); Two Egg Breakfast 15; Pancakes 13 (three fluffy
pancakes; add blueberries or chocolate chips $3); Pan Omelette 18 (three egg omelette with Monterey & cheddar and two
fillers, toast & side); Eggs Benny 18 (two poached eggs & back bacon on an English muffin, hollandaise, side); Tex-Mex
Scramble 18 (taco beef, tater tots, bell peppers, tomato, green onion, queso, scrambled eggs, banana peppers, salsa,
sour cream, guacamole; toast). Individual breakfast items: Breakfast Burger 13; Breakfast Wrap 12; Cinnamon Bun 10;
Bagel with Cream Cheese 6; Side Meat 7 (bacon, ham or sausage); Side Hashbrowns 6 (tater tots or shredded); Fruit Cup
6; Toast (2pc) 5.
Lighter fare, Soup & salads: Soup of the Day 11 (ask server); House Salad 14 (mixed greens, carrot, onion, tomato,
cucumber, olives, pepperoncini, marinated chickpeas, croutons, parmesan, signature house Italian); Caesar Salad 14
(romaine, croutons, parmesan, bacon, house made caesar); Prosciutto & Pear Salad 18 (artisan greens, shaved
prosciutto, white wine poached pears, red onion, candied pecan, goat cheese, champagne vinaigrette). Add garlic toast
4, add grilled chicken 6; half house or caesar salad 12. Basic sandwiches: Grilled Cheese 10; BLT 10; Denver 10; Ham &
Cheese 8; Turkey 8; Corned Beef 8; Whistle Dog 10; Salmon Salad 8; Albacore Tuna 8. Side orders: House Fries 5; Onion
Rings 7; Poutine 8.
Snacks & shares: Macho Nachos 20 (tortilla chips, queso, corn, tomatoes, pickled jalapenos, black beans, green onion;
chicken or beef; salsa & sour cream); Original Quesadilla 17 (chicken or beef); Wings 19 (buffalo, Cajun, honey garlic,
sweet chili, lemon pepper, BBQ, Montreal steak spice, salt & pepper, hot honey, or red dragon); Yorkie Bites 20 (five
mini Yorkies with slow roasted CAB prime rib, horseradish cream, au jus); Pretzel Sticks 16 (six soft pretzels, house
beer cheese dip); Spinach & Artichoke Dip 17 (toasted naan); Buffalo Chicken Taquitos 17 (four, with ranch); Chicken
Lettuce Wraps 20 (chicken, water chestnuts, bamboo shoots, celery, onions, carrot, green onion, cilantro, hoisin).
Baskets & bowls: House Fries 9; Onion Rings 14; Poutine 15; Curly Fries 12.
Handheld (served with choice of soup, fries, caesar or house salad): Smashburger 19 (6oz house made CAB burger, bacon,
cheese, pickles, tomato, onions, lettuce, mustard & fry sauce); Clubhouse Sandwich 18; StB Beef 19 (slow roasted CAB
sirloin, onions & mushrooms, swiss and cheddar, bistro sauce, baguette, au jus); Crispy Honeydill-wich 20 (breaded
chicken in honey dill, provolone, lettuce, pickled red onion, dill chips, onion Kaiser); Blackened Chicken Wrap 18;
Shrimp Po' Boy 20; St. B Crunch Wrap 18 (signature beef crunch wrap).
Main attractions: Chicken Fingers 20 (five tenders, side); Fish & Chips 20 (two pieces house beer battered cod, tartar,
fries); Ginger Beef Bowl 22 (rice); Kung Pao Chicken 22 (wok fired chicken, veggies, cashews, soy ginger garlic sauce,
chow mein noodles).
Taps: 6 local beers on tap including a house feature tap (beer names not published: use "Local tap feature" style
placeholders, no invented brewery names). Friday night pizza menu (items not published: a single "Friday night pizza"
feature is fine).

## People (real, from the Contact page; already in the `staff` seed)
Steve Wood, Director of Golf (stf_2, x209). Carly Dalmyn, Director of Clubhouse Operations and Special Events (stf_1,
x215). Craig Campbell, Course Superintendent (stf_6, 204-235-1549). Ian Wong, Executive Chef (stf_12, x206). Tori
Sawchyn, Administrative Assistant (stf_19, x200). Leslie Filopoulos, Controller (stf_20, x202). Main line 204-233-2497.
All other staff and every member are fictional demo people. Never attribute quotes or invented actions to the real
people beyond their role (e.g. "weekly features created by Executive Chef Ian Wong" is fine; a made-up biography is not).

## Venue names used in the system (interim, pending the client's confirmation)
The system has four dining/event spaces. Map them exactly like this everywhere (staff dining, portal dining, dashboard,
events, member preferences, reservations seed data):
| Old (Ashbourne) | New (St. Boniface) |
|---|---|
| Main Dining Room | Gallery Taphouse & Grill |
| Grill Room | Taphouse Bar |
| Terrace | Patio |
| Private Dining | Banquet Hall |
| Clubhouse Ballroom (events) | Banquet Hall |
| Wine Cellar, Pavilion (events) | drop; use Gallery Taphouse & Grill or Banquet Hall |
| Championship Course (events) | The Course |
| Practice Academy (events) | Short game practice facility |
Member dining preference values: 'Gallery Taphouse & Grill', 'Taphouse Bar', 'Patio'.
Only "The Gallery Taphouse & Grill" and the banquet/wedding space are confirmed by the website; the bar and patio are
reasonable assumptions the client will confirm. Keep floor plans; rename them.
