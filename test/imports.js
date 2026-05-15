import { readFileSync, writeFileSync } from "fs";
import path from "path";

const content = "test";
console.log("FS functions available:", typeof readFileSync, typeof writeFileSync);