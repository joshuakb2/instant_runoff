# Instant Runoff Calculator

## To build:

```
npm ci
npm run make
```

## To use:

```
./main.js my_data.csv output.pdf
```

## Input CSV data

The input file should be a basic CSV file. The first line should be the names of the candidates and every line after that should be a single ballot.
Each item in a ballot row should either be empty or an integer, where 1 is the highest preference and higher numbers indicate lower priority rankings.
