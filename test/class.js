class Calculator {
  add(a, b) {
    return a + b;
  }
  multiply(a, b) {
    return a * b;
  }
}

const calc = new Calculator();
console.log("5 + 3 =", calc.add(5, 3));
console.log("5 * 3 =", calc.multiply(5, 3));