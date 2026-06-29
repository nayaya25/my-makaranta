module.exports = {
  moduleFileExtensions: ["js", "json", "ts", "tsx"],
  rootDir: ".",
  testRegex: "(src|prisma)/.*\\.spec\\.ts$",
  transform: { "^.+\\.(t|j)sx?$": ["ts-jest", { tsconfig: "tsconfig.json" }] },
  testEnvironment: "node",
};
