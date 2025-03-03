#!/bin/bash

mongosh --quiet --eval '
  db.adminCommand({ listDatabases: 1 }).databases
    .map(db => db.name)
    .filter(name => name.startsWith("PW-"))
    .forEach(name => { db.getSiblingDB(name).dropDatabase(); });
   '
