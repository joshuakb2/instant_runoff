#!/usr/bin/env node

import * as fs from 'fs';
import { markdownToPdf } from '@mdpdf/mdpdf';

function main() {
    const args = process.argv.slice(2);

    if (args.join(' ') === '--help') {
        help(console.log);
        process.exit(0);
    }

    if (args.length != 2) {
        help(console.error);
        process.exit(1);
    }

    const [csvFilePath, pdfFilePath] = args;

    const csv = fs.readFileSync(csvFilePath).toString();
    const report = generateReport(csv);
    markdownToPdf(report).then(buffer => fs.writeFileSync(pdfFilePath, buffer));
}

function checkInvalidInput(lines) {
    const headers = lines[0];

    let foundProblem = false;

    for (let i = 1; i < lines.length; i++) {
        if (lines[i].length > headers.length) {
            foundProblem = true;
            console.error(`Line #${i + 1} has more columns than there are candidates.`);
        }

        const rankings = lines[i].filter(Boolean).map(x => +x).sort((a, b) => a - b);
        for (let j = 0; j < rankings.length; j++) {
            if (rankings[j] !== j + 1) {
                foundProblem = true;
                console.error(`Line #${i + 1} has invalid rankings.`);
                break;
            }
        }
    }

    if (foundProblem) process.exit(1);
}

function generateReport(csv) {
    let report = '';

    const lines = csv.split('\n').filter(Boolean).map(s => s.split(','));
    checkInvalidInput(lines);

    const candidateNames = lines[0];
    const initialVotes = lines.slice(1).map(arr => {
        const rankings = [];
        for (let candidate = 0; candidate <= arr.length; candidate++) {
            const rank = arr[candidate];
            if (!rank) continue;
            rankings[+rank - 1] = candidate;
        }
        return rankings;
    });

    report += '# Instant Runoff Results\n\n';

    function getDistribution(candidates, votes) {
        const totals = candidates.map(candidate => {
            const count = votes.filter(v => v[0] === candidate).length;

            return {
                candidate,
                count,
                percent: 100 * count / votes.length,
            };
        });
        return totals.sort((a, b) => b.count - a.count);
    }

    function printTable(distribution) {
        report += '| Candidate | Percent | Votes |\n';
        report += '|---------- | ------- | ------|\n';
        for (const { candidate, count, percent } of distribution) {
            report += `| ${candidateNames[candidate]} | ${percent.toFixed(2)}% | ${count} |\n`;
        }
    }

    const initialCandidates = Array.from({ length: candidateNames.length }, (_, i) => i);
    const initialDistribution = getDistribution(initialCandidates, initialVotes);

    report += '## Initial results (phase 1)\n\n';

    if (initialDistribution[0].percent > 50) {
        report += `"${candidateNames[initialDistribution[0].candidate]}" won right away with ${initialDistribution[0].percent.toFixed(2)}% of the vote!\n\n`;
        printTable(initialDistribution);
        return report;
    }

    report += 'No candidate surpassed the 50% threshold to win.\n\n';
    printTable(initialDistribution);
    report += '\n';
    report += `${initialVotes.length} ballots were cast.\n\n`;

    let candidates = JSON.parse(JSON.stringify(initialCandidates));
    let votes = JSON.parse(JSON.stringify(initialVotes));
    let distribution = initialDistribution;

    function removeCandidates(toRemove) {
        candidates = candidates.filter(c => !toRemove.includes(c));

        for (let i = 0; i < votes.length; i++) {
            const vote = votes[i];
            for (let j = 0; j < vote.length; j++) {
                if (toRemove.includes(vote[j])) {
                    vote.splice(j, 1);
                    j--;
                }
            }
            if (vote.length === 0) {
                votes.splice(i, 1);
                i--;
            }
        }
    }

    const candidatesWithNoVotes = distribution
        .filter(({ percent }) => percent === 0)
        .map(({ candidate }) => candidate);

    if (candidatesWithNoVotes.length > 0) {
        report += 'The following candidates are eliminated because they received no votes:\n\n';
        for (const candidate of candidatesWithNoVotes) {
            report += `- ${candidateNames[candidate]}\n`;
        }
        report += '\n';
        removeCandidates(candidatesWithNoVotes);
        distribution = getDistribution(candidates, votes);
    }

    let phase = 1;

    while (true) {
        phase += 1;

        const lowestPercent = Math.min(...distribution.map(x => x.percent));
        const candidatesToEliminate = distribution.filter(({ percent }) => percent === lowestPercent).map(({ candidate }) => candidate);

        // Can't eliminate all the candidates!!!
        if (candidatesToEliminate.length === candidates.length) {
            report += `It's a ${candidates.length}-way tie!\n`;
            return report;
        }

        report += 'The following candidates have the lowest number of votes and are eliminated:\n\n';
        for (const candidate of candidatesToEliminate) {
            report += `- ${candidateNames[candidate]}\n`;
        }
        report += '\n';

        removeCandidates(candidatesToEliminate);

        report += `## Phase ${phase}\n\n`;

        distribution = getDistribution(candidates, votes);

        if (distribution[0].percent > 50) {
            report += `"${candidateNames[distribution[0].candidate]}" wins with ${distribution[0].percent.toFixed(2)}% of the vote.\n\n`;
            const eliminatedBallots = initialVotes.length - votes.length;
            report += `${(100 * eliminatedBallots / initialVotes.length).toFixed(2)}% (${eliminatedBallots}/${initialVotes.length}) of ballots cast were eliminated.\n\n`;
            printTable(distribution);
            return report;
        }

        report += 'No candidate surpassed the 50% threshold to win.\n\n';
        const eliminatedBallots = initialVotes.length - votes.length;
        report += `${(100 * eliminatedBallots / initialVotes.length).toFixed(2)}% (${eliminatedBallots}/${initialVotes.length}) of ballots cast have been eliminated so far.\n\n`;
        printTable(distribution);
        report += '\n';
    }
}

function help(log) {
    log('Usage: ./main.js <input CSV> <output PDF>');
    log('');
    log('The input CSV file should have one header row followed by all the ballot rows.');
    log('');
    log('Each ballot row value should either be an empty string or a ranking where the');
    log('highest ranking is 1 and lower rankings are higher numbers.');
    log('');
    log('No ballow row should have any duplicate rankings or gaps.');
}

main();
