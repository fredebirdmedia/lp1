// Declare variables
var state = 1;

// Grab URL variable values and assign them to variables
var subid = getURLParameter("subid");
var subid2 = getURLParameter("subid2");
var firstname = getURLParameter("firstname");
var surname = getURLParameter("surname");
var city = getURLParameter("city");
var zipcode = getURLParameter("zipcode");
var address = getURLParameter("address");
var phone = getURLParameter("phone");
var mobile = getURLParameter("mobile");
var pid = getURLParameter("pid");
var nrp = getURLParameter("nrp");

// FunnelFlux
var ffdomain = "https://" + getURLParameter("ffdomain");
var session = getURLParameter("session");
var fluxf = getURLParameter("fluxf");
var fluxffn = getURLParameter("fluxffn");

const queryString = window.location.search;
const urlParams = new URLSearchParams(queryString);
const entries = urlParams.entries();
var params = [];
var paramString = "";

// Get URL parameters function
function getURLParameter(name) {
    return decodeURI(
        (RegExp(name + "=" + "(.+?)(&|$)").exec(location.search) || [, null])[1] ||
        ""
    );
}

// Loop through URL parameters and assign them to the params object
for (const entry of entries) {
    let k = entry[0].toLowerCase();
    if (k == "ffdomain" || k == "fluxffn" || k == "fluxf") {
        continue;
    }
    params[k] = entry[1];
    paramString += "&" + k + "=" + entry[1];
}

// Replace texts from texts.js
function replaceText(name) {
    if (typeof eval(name) !== "undefined") {
        document.getElementById(name).innerHTML = eval(name);
    }
}

document.addEventListener("DOMContentLoaded", function () {
    replaceText("TXT_TITLE");
    replaceText("TXT_SUBHEADER");
    replaceText("TXT_TERMS");
    replaceText("TXT_EXPIRES");
    replaceText("TXT_TRY_AGAIN");
});

$(document).ready(function () {
    const treasureButtons = document.querySelectorAll(".item");
    const pop = document.querySelector(".pop");
    const popRewardImage = document.querySelector(".pop-reward-image");
    const rewardButton = document.querySelector(".pop-reward-btn");
    const winSubheader = document.getElementById("TXT_WIN_SUBHEADER");
    const timeText = document.querySelector(".pop-reward-time");
    const midText = document.getElementById("TXT_SUBHEADER");

    // Preload audio
    var mPop = new Audio("./assets/audio/pop.mp3");
    var mMissed = new Audio("./assets/audio/missed-1.mp3");
    var mWin = new Audio("./assets/audio/win.mp3");
    var mWinner = new Audio("./assets/audio/winner.mp3");
    var mBG = new Audio("./assets/audio/bg-music.mp3");

    // Preload images
    var imgPopLose = new Image();
    imgPopLose.src = "./assets/skull.png";
    var imgPopWin = new Image();
    imgPopWin.src = "./assets/hour-glass.png";
    var imgPopJackpot = new Image();
    imgPopJackpot.src = "./assets/jackpot.png";

    // when user click any where on the page play background music
    document.addEventListener("click", function () {
        mBG.volume = 0.05;
        mBG.loop = true;
        mBG.play();
    });

    /**
     * 
     * @param {any} treasureButton - The treasure button element to set up.
     */
    function setupTreasureButton(treasureButton) {
        mPop.volume = 0.5; // Set the volume of the pop sound to 50%

        treasureButton.addEventListener("mouseenter", () => {
            if (!treasureButton.disabled) {
                treasureButton.classList.add("shake"); // Add the shake class to the button
                mPop.play();
            }
        });

        treasureButton.addEventListener("mouseleave", () => {
            treasureButton.classList.remove("shake"); // Remove the shake class from the button
        });

        treasureButton.addEventListener("click", () => {
            const imgElement = treasureButton.querySelector("img");
            if (state < 4) {
                // image will spin 360 degree while shrinking
                imgElement.style.transform = "rotate(360deg) scale(0)";
                imgElement.style.transition = "all 0.5s";
                imgElement.style.opacity = "0";
                imgElement.style.transition = "all 0.5s";

                // add class invisible to the button
                treasureButton.classList.add("invisible");
                treasureButton.disabled = true; // Disable the button

            }

            treasureButton.classList.remove("shake"); // Remove the shake class from the button

            switch (state) {
                case 1:
                    popupText(TXT_SHOTS_LEFT + " 2", imgPopLose.src);
                    mMissed.volume = 0.2;
                    mMissed.play();
                    break;
                case 2:
                    popupText(TXT_FIRST_WIN_SUBHEADER, imgPopWin.src);
                    mWin.volume = 0.2;
                    mWin.play();
                    break;
                case 3:
                    popupText(TXT_SECOND_WIN_BOX, imgPopJackpot.src);
                    rewardButton.innerHTML = TXT_CTA;
                    timeText.classList.remove("hidden");
                    counter(true, INT_REWARD_MINUTES);
                    mWinner.volume = 0.2;
                    mWinner.play(); 
                    break;
            }
        });
    }

    /**
     * Updates the countdown timer on the page.
     *
     * @param {boolean} flag - Determines whether to start the countdown.
     * @param {number} time - The initial time in minutes for the countdown.
     */
    function counter(flag, time) {
        // Select the counter element inside the timeText container.
        const timeTextCounter = timeText.querySelector(".counter");

        // If the counter element is not found, log an error and exit the function.
        if (!timeTextCounter) {
            console.error("Counter element not found");
            return;
        }

        // Check if the countdown should be started.
        if (flag) {
            // Convert the time from minutes to seconds.
            let totalTime = time * 60;

            // Set up an interval to update the countdown every second (1000 ms).
            const countdown = setInterval(() => {
                // Calculate minutes and seconds remaining from the total time.
                const minutes = Math.floor(totalTime / 60);
                const seconds = totalTime % 60;

                // Format minutes and seconds to always have two digits.
                const formattedMinutes = String(minutes).padStart(2, "0");
                const formattedSeconds = String(seconds).padStart(2, "0");

                // Update the counter element's text content with the formatted time.
                timeTextCounter.textContent = `${formattedMinutes}:${formattedSeconds}`;

                // If the total time reaches zero, stop the countdown.
                if (totalTime <= 0) {
                    clearInterval(countdown);
                }

                totalTime--; // Decrement the total time by 1 second.
            }, 1000);
        }
    }
    /**
     * Displays a popup with the specified title, subheader, and image source.
     * 
     * @param {any} title - The title of the popup.
     * @param {any} subheader - The subheader of the popup.
     * @param {any} src - The image source for the popup.
     */
    function popupText(subheader, src) {
        setTimeout(() => {
            if (pop) {
                pop.style.clipPath = "circle(100% at 50% 50%)"; // Open popup
            } else {
                console.error("Element with class 'pop' not found."); // Log an error if the element is not found
            }
        }, 200); // Delay the opening of the popup by 200ms

        winSubheader.innerHTML = subheader;
        popRewardImage.src = src

        if (state < 4) state++;
    }

    /**
     * Sets up the reward button event listener.
     */
    function setupRewardButton() {
        rewardButton.addEventListener("click", () => { // When the reward button is clicked
            if (state < 4) {
                pop.style.clipPath = "circle(0% at 50% 50%)"; // Close popup
                mPop.play(); // Play pop sound
            } else {
                window.location.href = HREF_REDIRECT; // Redirect to the specified URL
            }
        });
    }

    // Initialize event listeners for all treasure buttons
    treasureButtons.forEach(setupTreasureButton);

    // Initialize reward button
    setupRewardButton();
});
