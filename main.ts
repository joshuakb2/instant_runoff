#!/usr/bin/env node

import * as fs from 'fs';
import { markdownToPdf } from '@mdpdf/mdpdf';

function main(): void {
    const args = process.argv.slice(2);

    if (args.join(' ') === '--help') {
        help(console.log);
        process.exit(0);
    }

    if (args.length != 2) {
        help(console.error);
        process.exit(1);
    }

    const csvFilePath = args[0]!;
    const pdfFilePath = args[1]!;

    const csv = fs.readFileSync(csvFilePath).toString();
    const report = generateReport(csv);
    markdownToPdf(report).then(buffer => fs.writeFileSync(pdfFilePath, buffer));
}

function checkInvalidInput(lines: string[][]): void {
    const headers = lines[0]!;

    let foundProblem = false;

    for (let i = 1; i < lines.length; i++) {
        if (lines[i]!.length > headers.length) {
            foundProblem = true;
            console.error(`Line #${i + 1} has more columns than there are candidates.`);
        }

        const rankings = lines[i]!.filter(Boolean).map(x => +x).sort((a, b) => a - b);
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

/**
 * 0-based index of header row
 */
type Candidate = number;

/**
 * Array of Candidates, highest preference first.
 */
type Ballot = number[];

type Distribution = ShareOfVotes[];

type ShareOfVotes = {
    candidate: Candidate;
    count: number;
    percent: number;
};

function generateReport(csv: string): string {
    let report = '';

    const lines = csv.split('\n').filter(Boolean).map(s => s.split(','));
    checkInvalidInput(lines);

    const candidateNames: string[] = lines[0]!;
    const initialBallots: Ballot[] = lines.slice(1).map(arr => {
        const ballot: Ballot = [];
        for (let candidate = 0; candidate <= arr.length; candidate++) {
            const rank = arr[candidate];
            if (!rank) continue;
            ballot[+rank - 1] = candidate;
        }
        return ballot;
    });

    report += '# Instant Runoff Results\n\n';

    function getDistribution(candidates: Candidate[], ballots: Ballot[]): Distribution {
        const shares: Distribution = candidates.map(candidate => {
            const count = ballots.filter(v => v[0] === candidate).length;

            return {
                candidate,
                count,
                percent: 100 * count / ballots.length,
            };
        });
        return shares.sort((a, b) => b.count - a.count);
    }

    function printTable(distribution: Distribution): void {
        report += '| Candidate | Percent | Votes |\n';
        report += '|---------- | ------- | ------|\n';
        for (const { candidate, count, percent } of distribution) {
            report += `| ${candidateNames[candidate]} | ${percent.toFixed(2)}% | ${count} |\n`;
        }
    }

    const initialCandidates: Candidate[] = Array.from({ length: candidateNames.length }, (_, i) => i);
    const initialDistribution: Distribution = getDistribution(initialCandidates, initialBallots);

    report += '## Initial results (phase 1)\n\n';

    if (initialDistribution[0]!.percent > 50) {
        report += `"${candidateNames[initialDistribution[0]!.candidate]}" won right away with ${initialDistribution[0]!.percent.toFixed(2)}% of the vote!\n\n`;
        printTable(initialDistribution);
        return report;
    }

    report += 'No candidate surpassed the 50% threshold to win.\n\n';
    printTable(initialDistribution);
    report += '\n';
    report += `${initialBallots.length} ballots were cast.\n\n`;

    let candidates: Candidate[] = [...initialCandidates];
    let ballots: Ballot[] = initialBallots.map(ballot => [...ballot]);
    let distribution: Distribution = initialDistribution;

    function removeCandidates(toRemove: Candidate[]) {
        candidates = candidates.filter(c => !toRemove.includes(c));

        for (let i = 0; i < ballots.length; i++) {
            const vote = ballots[i]!;
            for (let j = 0; j < vote.length; j++) {
                if (toRemove.includes(vote[j]!)) {
                    vote.splice(j, 1);
                    j--;
                }
            }
            if (vote.length === 0) {
                ballots.splice(i, 1);
                i--;
            }
        }
    }

    const candidatesWithNoVotes: Candidate[] = distribution
        .filter(({ percent }) => percent === 0)
        .map(({ candidate }) => candidate);

    if (candidatesWithNoVotes.length > 0) {
        report += 'The following candidates are eliminated because they received no votes:\n\n';
        for (const candidate of candidatesWithNoVotes) {
            report += `- ${candidateNames[candidate]}\n`;
        }
        report += '\n';
        removeCandidates(candidatesWithNoVotes);
        distribution = getDistribution(candidates, ballots);
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

        distribution = getDistribution(candidates, ballots);

        if (distribution[0]!.percent > 50) {
            report += `"${candidateNames[distribution[0]!.candidate]}" wins with ${distribution[0]!.percent.toFixed(2)}% of the vote.\n\n`;
            const eliminatedBallots = initialBallots.length - ballots.length;
            report += `${(100 * eliminatedBallots / initialBallots.length).toFixed(2)}% (${eliminatedBallots}/${initialBallots.length}) of ballots cast were eliminated.\n\n`;
            printTable(distribution);
            return report;
        }

        report += 'No candidate surpassed the 50% threshold to win.\n\n';
        const eliminatedBallots = initialBallots.length - ballots.length;
        report += `${(100 * eliminatedBallots / initialBallots.length).toFixed(2)}% (${eliminatedBallots}/${initialBallots.length}) of ballots cast have been eliminated so far.\n\n`;
        printTable(distribution);
        report += '\n';
    }
}

function help(log: (s: string) => void): void {
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
