// Add or remove URL parameters here. The prefill parameters can be used as placeholders.
var url_string = window.location.href;
var url = new URL(url_string);
var TXT_FIRSTNAME = url.searchParams.get("firstname");
var TXT_SURNAME = url.searchParams.get("surname");
var TXT_CITY = url.searchParams.get("city");
var TXT_ZIPCODE = url.searchParams.get("zipcode");
var TXT_ADDRESS = url.searchParams.get("address");
var TXT_PHONE = url.searchParams.get("phone");
var TXT_MOBILE = url.searchParams.get("mobile");

// FYI:
// Once a constant is set you can use it as a placeholder. Feel free to make more constants.
// HTML formatting like <b>,<i>,<br> etc. works within the quotation marks ''.

const TXT_TITLE = "SpinAway";
const TXT_HEADER = "Win a welcome bonus of 100% up to €500 + 200 free spins + 1 bonus crab!";
const TXT_SUBHEADER = "You have received 3 stars as a gift. Open them and see if you are the lucky winner.";
const TXT_SHOTS_LEFT = "Remaining Chances:";
const TXT_TRY_AGAIN = "TRY AGAIN!";
const TXT_FIRST_WIN_SUBHEADER = "You have won 200 free spins! Remaining chance: 1";
const TXT_SECOND_WIN_BOX = "Claim your welcome bonus of 100% up to €500 + 200 free spins + 1 bonus crab now!";
const TXT_CTA = "CONTINUE";
const TXT_EXPIRES = "This bonus will expire soon.";
const INT_REWARD_MINUTES = 10;
const TXT_TERMS = "The content of this page is not directly provided by Casino Mary but by a third party in collaboration with the casino.";
const HREF_REDIRECT = "https://ff.casinomary.com/action/1";

