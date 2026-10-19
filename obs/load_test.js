import http from 'k6/http';
import { sleep } from 'k6';

const API_URL = 'http://nginx/api/v1/kennels';

export let options = {
  stages: [
    { duration: '30s', target: 30 }, // simulate ramp-up of traffic from 0 to 30 users over 30s
    { duration: '2m', target: 15 }, // stay at 15 users for 2 minutes
  ],
};

export default function () {
  let response = http.get(API_URL + '?id=0');
  let response2 = http.get(API_URL + '?id=1');
  let response3 = http.get(API_URL + '?id=2');
  sleep(1);
}
