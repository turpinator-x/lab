# Can identify and explain a deep module in his own project

Jarrod explained claims-app as a deep module in his own words: input is a wallet address, output is the next claim time, and the back end hides the smart contract and Flare network API reads. He named leaks the caller still needs (wallet address, which chain, which claims portal).

**Evidence:** spoken answer after Lesson 1 covering verdict, deletion test and leaks.
**Nuance to revisit:** he said deleting the back end sends complexity "to the smart contract and APIs". That complexity already lives there. The deletion-test point is that it would reappear in every user or caller. Revisit in a later lesson.
**Implications:** ready for Lesson 2 (what changes together decides where a module's edges go, ties to bounded contexts).
