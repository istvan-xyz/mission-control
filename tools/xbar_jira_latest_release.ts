/**
 * JIRA_BASE_URL
 * JIRA_API_EMAIL
 * JIRA_API_TOKEN
 * JIRA_BOARD_PROJECT_KEY
 * JIRA_BOARD_ID
 */
const AUTH_HEADER = `${Deno.env.get('JIRA_API_EMAIL')}:${Deno.env.get('JIRA_API_TOKEN')}`;

const baseUrl = Deno.env.get('JIRA_BASE_URL');

const runCommand = async ({ command, args = [] }: { command: string; args: string[] }) => {
    const proc = Deno.run({ cmd: [command, ...args], stdout: 'piped', stderr: 'piped', stdin: 'null' });
    await proc.status();
    return new TextDecoder().decode(await proc.output());
};

const callJiraApi = async (path: string) => {
    const url = `${baseUrl}/rest${path}`;
    const result = await runCommand({ command: 'curl', args: [url, '--user', AUTH_HEADER] });

    return JSON.parse(result);
};

interface Issue {
    key: string;
    fields: {
        summary: string;
        status: {
            name: string;
        };
        assignee: {
            displayName: string;
        };
        watches: {
            self: string;
        };
    };
}

const searchIssues = async (
    jql: string,
): Promise<{
    issues: Issue[];
}> => callJiraApi(`/api/2/search?jql=${encodeURIComponent(jql)}`);

const versionCompare = (version1: string, version2: string) => {
    const v1 = version1.split('.');
    const v2 = version2.split('.');
    const length = Math.max(v1.length, v2.length);

    for (let i = 0; i < length; i++) {
        const result = +(v1[i] || '0') - +(v2[i] || '0');

        if (result !== 0) {
            return result;
        }
    }

    return 0;
};

const printIssueLine = (item: Issue) => {
    const url = item.fields.watches.self
        .replace('rest/api/2/', '')
        .replace('/watchers', '')
        .replace('/issue/', '/browse/');
    console.log(
        `${item.fields.summary} ${item.key} ${item.fields.status.name} ${item.fields.assignee.displayName} | href=${url}`,
    );
};

const releases: {
    id: number;
    name: string;
}[] = (await callJiraApi(`/agile/1.0/board/${Deno.env.get('JIRA_BOARD_ID')}/version?released=false`)).values;
releases.sort((a, b) => versionCompare(a.name, b.name));
const currentItem = releases[0];
const itemsInRelease = await searchIssues(
    `project = "${Deno.env.get('JIRA_BOARD_PROJECT_KEY')}" AND fixVersion = ${currentItem.id} ORDER BY created DESC`,
);
const inProgressIssues = itemsInRelease.issues.filter((issue) => issue.fields.status.name === 'In Progress');
const inReviewIssues = itemsInRelease.issues.filter((issue) => issue.fields.status.name === 'Review');

console.log(
    `${currentItem.name} ${inProgressIssues.length ? `P:${inProgressIssues.length}` : ''} R:${
        inReviewIssues.length
    } | dropdown=false`,
);
console.log('---');
console.log('In Progress');
console.log('---');
for (const item of inProgressIssues) {
    printIssueLine(item);
}
console.log('Review');
console.log('---');
for (const item of inReviewIssues) {
    printIssueLine(item);
}
console.log('---');
console.log('Done');
console.log('---');
for (const item of itemsInRelease.issues.filter((issue: any) => issue.fields.status.name === 'Done')) {
    printIssueLine(item);
}
