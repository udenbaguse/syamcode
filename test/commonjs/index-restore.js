const __syamcode_modules = {
  0(module, exports, __syamcode_require) {
    const label = __syamcode_require(1);
    const math = __syamcode_require(2);
    const { formatAnswer: formatAnswer } = __syamcode_require(3);
    const secretValue = 41;
    const answer = math.double(secretValue);
    console.log(formatAnswer(label, answer));
  },
  1(module, exports, __syamcode_require) {
    module.exports = "result";
  },
  2(module, exports, __syamcode_require) {
    function double(value) {
      return value * 2;
    }
    exports.double = double;
  },
  3(module, exports, __syamcode_require) {
    function formatAnswer(label, answer) {
      return `${label} ${answer}`;
    }
    module.exports = { formatAnswer: formatAnswer };
  },
};
const __syamcode_cache = {};
function __syamcode_require(id) {
  if (__syamcode_cache[id]) return __syamcode_cache[id].exports;
  const module = { exports: {} };
  __syamcode_cache[id] = module;
  __syamcode_modules[id](module, module.exports, __syamcode_require);
  return module.exports;
}
__syamcode_require(0);
