const label = require("./label");
const math = require("./math");
const { formatAnswer } = require("./format");

const secretValue = 41;
const answer = math.double(secretValue);

console.log(formatAnswer(label, answer));
