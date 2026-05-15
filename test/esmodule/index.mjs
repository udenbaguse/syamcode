import label from "./label.js";
import { double } from "./math.js";
import { formatAnswer } from "./format.js";

const secretValue = 41;
const answer = double(secretValue);

console.log(formatAnswer(label, answer));
