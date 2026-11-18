// Where the user docs live: the GitHub wiki of this repository. npm run docs writes its generated pages
// (Inputs, Checks, Checks-<Group>); the other pages are written by hand there.

export const WIKI = "https://github.com/kreativ-anders/rechtzeitig/wiki";

/** Wiki page of a check group (the folder in checks/): legal → Checks-Legal. */
export const groupPage = (module: string) => `Checks-${module[0].toUpperCase()}${module.slice(1)}`;

/** Link to a rule on its group page, for the SARIF help link. GitHub gives headings lowercase ids. */
export const ruleUrl = (checkId: string, ruleId: string) => `${WIKI}/${groupPage(checkId.split("/")[0])}#${ruleId.toLowerCase()}`;
