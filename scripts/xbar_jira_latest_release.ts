/**
 * JIRA_BASE_URL
 * JIRA_API_EMAIL
 * JIRA_API_TOKEN
 * JIRA_BOARD_PROJECT_KEY
 * JIRA_BOARD_ID
 */
import { Issue, JiraClient } from '../jira.ts';

const jiraClient = new JiraClient(
    Deno.env.get('JIRA_BASE_URL') || '',
    Deno.env.get('JIRA_API_EMAIL') || '',
    Deno.env.get('JIRA_API_TOKEN') || '',
);

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
        `${item.fields.summary} ${item.key} ${item.fields.status.name} ${item.fields.assignee?.displayName} | href=${url}`,
    );
};

const releases: {
    id: number;
    name: string;
}[] = (await jiraClient.callJiraApi(`/agile/1.0/board/${Deno.env.get('JIRA_BOARD_ID')}/version?released=false`)).values;
releases.sort((a, b) => versionCompare(a.name, b.name));

const currentItem = releases[0];
const itemsInRelease = await jiraClient.searchIssues(
    `project = "${Deno.env.get('JIRA_BOARD_PROJECT_KEY')}" AND fixVersion = ${currentItem.id} ORDER BY created DESC`,
);
const toDoIssues = itemsInRelease.issues.filter((issue) => issue.fields.status.name === 'To Do');
const inProgressIssues = itemsInRelease.issues.filter((issue) => issue.fields.status.name === 'In Progress');
const inReviewIssues = itemsInRelease.issues.filter((issue) => issue.fields.status.name === 'Review');
const issuesDone = itemsInRelease.issues.filter((issue: any) => issue.fields.status.name === 'Done');

const countIndicators: string[] = [];

if (toDoIssues.length) {
    countIndicators.push(`🧾${toDoIssues.length}`);
}

if (inProgressIssues.length) {
    countIndicators.push(`⏳${inProgressIssues.length}`);
}

if (inReviewIssues.length) {
    countIndicators.push(`🔬${inReviewIssues.length}`);
}

console.log(`${currentItem.name} ${countIndicators.join(' ')} | dropdown=false`);
console.log('---');

if (toDoIssues.length) {
    console.log('To Do 🧾');
    console.log('---');
    for (const item of toDoIssues) {
        printIssueLine(item);
    }
    console.log('---');
}

if (inProgressIssues.length) {
    console.log('In Progress ⏳');
    console.log('---');
    for (const item of inProgressIssues) {
        printIssueLine(item);
    }
    console.log('---');
}

if (inReviewIssues.length) {
    console.log('Review 🔬');
    console.log('---');
    for (const item of inReviewIssues) {
        printIssueLine(item);
    }
    console.log('---');
}

if (issuesDone.length) {
    console.log('Done ✅ ');
    console.log('---');
    for (const item of issuesDone) {
        printIssueLine(item);
    }
}
