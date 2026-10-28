---
title: "Attention Is All You Need"
authors:
  - Ashish Vaswani
  - Noam Shazeer
  - Niki Parmar
year: 2017
category: Computer Science/AI/Transformers
pages: 15
current_page: 15
---

Notes on **Attention Is All You Need**.

Related: [[bert]], [[gpt3]]

## Summary

The Transformer replaces recurrence with self-attention. Every token can look at every other token in a single step, which makes training highly parallel and captures long-range dependencies better than recurrent networks.

## Key ideas

Multi-head attention lets the model attend to information from different representation subspaces at different positions. Positional encodings inject the order of the sequence, since attention alone is permutation invariant.

The architecture follows an encoder-decoder structure, and it became the foundation for models such as [[bert]] and [[gpt3]].
