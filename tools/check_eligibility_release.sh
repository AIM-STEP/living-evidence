#!/bin/sh
set -eu
cd "$(dirname "$0")/.."

node --test tests/eligibility/*.cjs tools/test_eligibility_*.cjs \
  tools/test_search_*.cjs tools/test_screening_*.cjs tools/test_fulltext_*.cjs
python3 -B -m unittest discover -s tools -p 'test_eligibility_*.py'
