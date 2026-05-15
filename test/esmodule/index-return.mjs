const __syamcode_modules = {
  0(module, exports, __syamcode_require) {
    const __syamcode_import_0_1 = __syamcode_require(1);
    const label = __syamcode_import_0_1.default;
    const __syamcode_import_0_2 = __syamcode_require(2);
    const double = __syamcode_import_0_2.double;
    const __syamcode_import_0_3 = __syamcode_require(3);
    const formatAnswer = __syamcode_import_0_3.formatAnswer;
    const secretValue = 41;
    const answer = double(secretValue);
    console.log(formatAnswer(label, answer));
  },
  1(module, exports, __syamcode_require) {
    const label = "result";
    const __syamcode_default_1 = label;
    exports.default = __syamcode_default_1;
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
    exports.formatAnswer = formatAnswer;
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
