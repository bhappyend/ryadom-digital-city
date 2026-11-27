[out:json][timeout:60][maxsize:33554432];
rel(3339993)->.boundary;
.boundary map_to_area->.city;
.boundary out meta bb;
(
  nwr(area.city)["amenity"~"^(cafe|restaurant|fast_food|food_court|bar|pub|pharmacy|hospital|clinic|doctors|dentist|veterinary|bank|atm|school|kindergarten|university|college|library|townhall|police|post_office|courthouse|cinema|theatre|arts_centre|fuel|car_wash|car_rental)$"];
  nwr(area.city)["shop"];
  nwr(area.city)["tourism"~"^(hotel|motel|hostel|guest_house|museum|attraction|gallery)$"];
  nwr(area.city)["leisure"~"^(fitness_centre|sports_centre|stadium|swimming_pool|amusement_arcade)$"];
  nwr(area.city)["office"~"^(government|insurance|travel_agent|lawyer|accountant)$"];
  nwr(area.city)["craft"];
);
out meta center;
