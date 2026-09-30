const classDropdown = document.getElementById("classDropdown");
const cityInput = document.getElementById("cityInput");
const numberOutput = document.getElementById("numberOutput");
const resultElement = document.getElementById("result");
const generateBtn = document.getElementById("generateBtn");

const LOCATION_CODES = {
  "rochester hills": "093",
  "waterford township": "011",
  "sterling heights": "121",
  // Add more locations and their numbers here
};

function setResult(message, isNumber = false) {
  if (numberOutput) {
    numberOutput.textContent = message;
  }

  if (resultElement) {
    resultElement.classList.toggle("result--success", isNumber);
  }
}

function generateNumberString() {
  if (!classDropdown || !cityInput) return;

  const selectedClass = classDropdown.value;
  const selectedLocation = cityInput.value.trim();

  if (!selectedLocation) {
    setResult("Enter a city to continue.");
    return;
  }

  const locationCode = LOCATION_CODES[selectedLocation.toLowerCase()];
  if (!locationCode) {
    setResult(`No code defined for "${selectedLocation}".`);
    return;
  }

  const classValue = selectedClass === "Primary" ? 473 : 503;
  const numberString = `${classValue}${locationCode}`;

  setResult(numberString, true);
}

if (generateBtn) {
  generateBtn.addEventListener("click", generateNumberString);
}

if (cityInput) {
  cityInput.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      generateNumberString();
    }
  });
}

let marker;

function initMap() {
  const mapElement = document.getElementById("map");

  if (!mapElement) {
    return;
  }

  const map = new google.maps.Map(mapElement, {
    zoom: 15,
    center: { lat: 42.655046116576514, lng: -83.33576692214353 },
  });
  const geocoder = new google.maps.Geocoder();
  const infowindow = new google.maps.InfoWindow();

  map.addListener("click", (event) => {
    const latlng = event.latLng;

    if (marker) {
      marker.setMap(null);
    }

    geocodeLatLng(geocoder, map, infowindow, latlng);
  });
}

function geocodeLatLng(geocoder, map, infowindow, latlng) {
  geocoder
    .geocode({ location: latlng })
    .then((response) => {
      if (response.results[0]) {
        const addressComponents = response.results[0].address_components;

        let city;
        for (let i = 0; i < addressComponents.length; i++) {
          const component = addressComponents[i];
          if (component.types.includes("locality")) {
            city = component.long_name;
            break;
          }
        }

        if (city) {
          marker = new google.maps.Marker({
            position: latlng,
            map: map,
          });

          infowindow.setContent(city);
          infowindow.open(map, marker);

          if (cityInput) {
            cityInput.value = city;
            generateNumberString();
          }
        } else {
          window.alert("No city information found");
        }
      } else {
        window.alert("No results found");
      }
    })
    .catch((e) => window.alert("Geocoder failed due to: " + e));
}

window.initMap = initMap;
setResult("—");
