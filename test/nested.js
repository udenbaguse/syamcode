let name = "Syam";

function outerFunction(message) {
  // nested function
  function innerFunction(prefix) {
    const name = "Syam"
    return `${prefix} ${message} ${name}`;
  }

  return innerFunction("Hello");
}

const result = outerFunction("Nested function works!");
console.log(result);
