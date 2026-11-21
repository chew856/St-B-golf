# Open questions for the club

Things the system needs an answer to, which the owner did not know yet. Each one has a placeholder in the system
until it is answered. Ask the club, then tell Claude the answer.

Last updated: November 21, 2026.

## Prices and money

1. **Prices for the new membership types.** The 2025 Membership Handbook lists these categories but no prices:
   Eagle 60+, Eagle Intermediate (INT), Birdie Intermediate (INT), Social, and Club House.
   They show "Not set" in Settings > Billing and "Price to be set by the club" on the public Join page.
2. **Lesson package prices.** The three packages use placeholder prices ($475, $200, $320). What should they be?
3. **Unused food and drink credit at the end of the season.** The handbook says the $375 Food and Beverage Assessment
   is non-transferable, so what is not used by October 31 expires. Should that expired credit count as club income?
   (A question for the club's accountant.) Today it shows in Billing only, not in Reports revenue.
4. **9-hole green fee rounding.** Public 9-hole fees are 60% of the 18-hole fee. Is that the club's rate, and how
   should it round?
5. **Twilight green fee.** The public twilight rate ($45) is a placeholder; the club website does not publish it.
6. **Payment processor.** Card on file, Apple Pay and Google Pay wait until the club chooses a processor.

7b. **Dietary markings on the menu.** Members can filter the menus by Vegetarian, Vegan and Gluten free, but the club's
   menu marks only 7 of 64 dishes (6 vegetarian; the Fruit Cup is vegan and gluten free). Which other dishes qualify?
   Staff can mark them in Dining > Menu (edit a dish).

## Golf rules

7. **Social members' golf vouchers.** Social members get 5 golf vouchers a season. The handbook does not say when they
   can play or how far ahead they can book. The system lets them book up to 7 days ahead (the public window), at any
   time. Is that right?
8. **The 10% member discount** for Social and Club House members (Gallery and Pro shop). It is stored but not applied
   anywhere yet, because there is no member discount at the tills today. Should the tills apply it?
9. **Weekend ballot timing.** The handbook can be read two ways. The system:
   - opens entries at 12:00 AM, 15 days before the day of play;
   - closes entries at the draw, 12:00 PM, 13 days before.
   Is that what the club does?
10. **Tee booking hours.** The handbook says tee times can be booked through the Pro Shop "Monday-Sunday 7:00-9:00pm".
    Is that 7:00 AM to 9:00 PM?

## People and names

11. **Real staff and board names.** The demo uses made-up staff names. The handbook names the real management team and
    Board of Directors. Replace them? (Owner: not yet. The staff account shows "Duane" for now.)
12. **Golf Canada Score Centre link.** Add a link for members' official handicaps? (Owner: not now.)

## Wording and display

13. **French ties on leaderboards** show a shared place as "É1" (for "égalité"). Is that the wording the club wants?
14. **Arrow symbols** (such as the arrows in "Next" buttons) are used in a few places. The house rule says no emojis;
    arrows are not emojis, but say if they should go.
15. **Beverage cart names in French.** The carts keep their English names on the French pages. Translate them?
16. **Leaderboard hole buttons on phones.** In Reports > Leaderboard, the 18 hole buttons are small on a phone
    (9 in a row). Keep, or change the layout?

## Before going live

17. **Safari check.** Everything is tested in Chrome. The owner tests in Safari on a Mac and iPad: please try the new
    pages there (Play, Leaderboards, Handbook, Weekend ballot, Billing).
18. **A server.** Until the club has a server, data stays in each browser: phones in a group cannot score together
    live, and staff on different computers do not see the same tee sheet.
19. **Receipts for older demo charges** are created once, on whichever page opens first. A browser that opens the
    members' portal or public site first never gets receipts for the older staff charges. Keep as is, or create them
    on every page?

## The scorecard (on hold until the club answers)

The system has the club scorecard's Black, Green and Silver yardages, men's par, and the Black or Green stroke index
(they match the printed card exactly). These parts of the card are not in the system yet:

20. **Combination tees.** The card lists Black/Green (6,214 yards) and Green/Silver (5,799 yards). Should members be
    able to choose them when they play and post scores?
21. **Stroke index for each tee.** The card has a separate stroke index for Silver and for each combination tee. Should
    net scores, Stableford and skins use the index of the tee each player plays?
22. **What "6/10" means.** Some combination-tee holes show two numbers (for example hole 10: 6/10). The owner's reading
    is men's / women's, the same way the par row shows "Men's/Women's Par" (hole 10 is a par 4 for men and a par 5 for
    women, so it ranks easier for women). The card does not say so: please confirm.
23. **The Green/Silver combination handicap row looks misprinted.** A stroke-index row must use each number from 1 to 18
    once. That row has 3, 13 and 15 twice each and never has 6, 7, 10 or 17. What is the correct row?
24. **Women's par and women's stroke index.** Holes 10 and 12 are par 5 and par 4 for women (36/38 = 74). The system does
    not record which golfers play the women's card. Should each member (and guest) have a "Scorecard: Men's / Women's"
    setting?
25. **Course and slope ratings.** Handicaps use placeholder ratings for every tee. The club's official ratings (from
    Golf Canada) are needed for Black, Green, Silver and the combination tees, men's and women's.

## Ideas waiting for the club

26. **Check in from your phone.** A "Check in" button in the members' portal (and for public golfers) that appears about
    15 minutes before the tee time. Tapping it tells the golf shop the player has arrived and marks the group checked in
    on the staff tee sheet. Does the club want members to check themselves in, or should check-in stay at the golf shop
    counter (for example to collect guest fees and cart fees first)? Should it only work when the phone is at the club
    (location check)?
