Autocracy
=========

Absolute power to automate OCR.


Installing
----------

    $ npm install -g autocracy

Alternatively, don't install it and just prepend the below commands with `npx`.

You will also need to install tools that Autocracy relies on to operate, [Tesseract](https://github.com/tesseract-ocr/tesseract), [MuPDF](https://github.com/ArtifexSoftware/mupdf), and [QPDF](https://github.com/qpdf/qpdf). On a Mac with Homebrew these can be installed with `brew install tesseract mupdf qpdf`.

If possible you should install Tesseract v5, which is in alpha at time of writing, but is faster. Also if not using Homebrew check your installation includes the Tesseract fast training data for your desired languages, which can otherwise be downloaded [from here](https://github.com/tesseract-ocr/tessdata_fast).


Usage
-----

Autocracy can run two different processes.

Create searchable PDFs:

    $ autocracy make-searchable <origin> <destination>

Produce text files:

    $ autocracy get-text <origin> <destination>

In either case, origin should be a directory of PDF files. Destination should be the name of a directory that will be created containing the results.

By default, Autocracy will first attempt to extract any tagged-text from within the PDF files. If tagged-text is found, it is used instead of OCRing, which is much slower. To disable this use the `--force-ocr` flag. The `--preprocess` flag will do some processing to attempt to improve OCR quality. The language expected in the documents defaults to English, but can be specified by passing the `--language` flag one of the language codes [from this page](https://tesseract-ocr.github.io/tessdoc/Data-Files-in-different-versions.html).

A directory named `.autocracy-cache` will be created to contain intermediate files. These can be used on subsequent invocations of Autocracy. You may wish to delete this directory though, as it can get quite large.
