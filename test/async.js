async function fetchData() {
  return "data loaded";
}

async function main() {
  const result = await fetchData();
  console.log(result);
}

main();