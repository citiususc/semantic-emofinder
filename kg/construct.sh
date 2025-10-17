#!/bin/bash
rm knowledge-graph.nt
python3 -m yatter -i ./mapping_rules/mapping_metadata.yml -o mapping_metadata.rml.ttl
python3 -m yatter -i ./mapping_rules/mapping_guasch_2016.yml -o mapping_guasch_2016.rml.ttl
python3 -m yatter -i ./mapping_rules/mapping_ferre_2017.yml -o mapping_ferre_2017.rml.ttl
python3 -m yatter -i ./mapping_rules/mapping_alonso_2015.yml -o mapping_alonso_2015.rml.ttl
python3 -m yatter -i ./mapping_rules/mapping_diez-alamo_2018.yml -o mapping_diez-alamo_2018.rml.ttl
python3 -m yatter -i ./mapping_rules/mapping_ferre_2012.yml -o mapping_ferre_2012.rml.ttl
python3 -m yatter -i ./mapping_rules/mapping_ferre_2024.yml -o mapping_ferre_2024.rml.ttl
python3 -m yatter -i ./mapping_rules/mapping_gonzalez_nosti_2014.yml -o mapping_gonzalez_nosti_2014.rml.ttl
python3 -m yatter -i ./mapping_rules/mapping_haro_2024.yml -o mapping_haro_2024.rml.ttl
python3 -m yatter -i ./mapping_rules/mapping_hinojosa_2016a.yml -o mapping_hinojosa_2016a.rml.ttl
python3 -m yatter -i ./mapping_rules/mapping_hinojosa_2016b.yml -o mapping_hinojosa_2016b.rml.ttl
python3 -m yatter -i ./mapping_rules/mapping_hinojosa_2020.yml -o mapping_hinojosa_2020.rml.ttl
python3 -m yatter -i ./mapping_rules/mapping_hinojosa_2024.yml -o mapping_hinojosa_2024.rml.ttl
python3 -m yatter -i ./mapping_rules/mapping_miguel-abella_2021.yml -o mapping_miguel-abella_2021.rml.ttl
python3 -m yatter -i ./mapping_rules/mapping_perez-sanchez_2021.yml -o mapping_perez-sanchez_2021.rml.ttl
python3 -m yatter -i ./mapping_rules/mapping_redondo_2005.yml -o mapping_redondo_2005.rml.ttl
python3 -m yatter -i ./mapping_rules/mapping_redondo_2007.yml -o mapping_redondo_2007.rml.ttl
python3 -m yatter -i ./mapping_rules/mapping_sabater_2022.yml -o mapping_sabater_2022.rml.ttl
python3 -m yatter -i ./mapping_rules/mapping_stadthagen_gonzalez_2017.yml -o mapping_stadthagen_gonzalez_2017.rml.ttl
cp ./input_data/*.csv .
python3 -m morph_kgc config.ini
rm *.csv
rm *.rml.ttl
