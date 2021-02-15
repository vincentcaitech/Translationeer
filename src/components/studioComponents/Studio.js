import React from "react";
import { pAuth, pFirestore, fbFieldValue } from "../../services/config";
import Auth from "../Auth";
import { LangContext } from "../../services/context";
import Slider from "./slider";
import LeftStudio from "./leftStudio";
import RightStudio from "./rightStudio";
import EditTranslation from "./editTranslation";
import StudioHeader from "./studioHeader";
import Loading from "../Loading";
import DocumentsList from "../DocumentsList";
import StudioDefault from "./studioDefault";
import { Redirect, browserHistory, Link } from "react-router-dom";
import { Beforeunload } from "react-beforeunload";

var x, y;
var rect;
window.addEventListener("mousemove", (e) => {
  // e = Mouse click event.
  if (document.querySelector("body") && !rect) {
    rect = document.querySelector("body").getBoundingClientRect();
  }
  if (rect) {
    x = e.pageX - rect.left; //x position within the element.
    y = e.pageY - rect.top; //y position within the element.
  }
});

function clearSelection() {
  if (window.getSelection) {
    window.getSelection().removeAllRanges();
  } else if (document.selection) {
    document.selection.empty();
  }
}

class Studio extends React.Component {
  constructor() {
    super();
    this.state = {
      documents: [],
      currentDoc: null,
      currentSection: -1,
      loading: false,
      redirect: false,
      translation: "", //what is in the edit translation text area
      isSaved: true,
    };
  }

  componentWillMount() {
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.has("document")) {
      this.setCurrentDoc(urlParams.get("document"));
    }
  }

  componentDidMount() {
    var newThis = this;
    pAuth.onAuthStateChanged((user) => {
      if (user) {
        pFirestore
          .collection("users")
          .doc(pAuth.currentUser.uid)
          .collection("documents")
          .orderBy("timestamp", "desc")
          .onSnapshot((docs) => {
            var arr = [];

            docs.forEach((d) => {
              arr.push({ ...d.data(), uid: d.id });
            });

            this.setState({ documents: arr });
            //make sure to check URL Params
            this.checkURLParams();
          });
      }
    });

    window.addEventListener(
      "beforeunload",
      function (e) {
        if (!newThis.state.isSaved) {
          e.preventDefault();
          e.returnValue = "";
        }
      },
      false
    );
  }

  checkURLParams = () => {
    //checking if there is url param. if so, then automatically open a specific document.
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.has("document")) {
      this.setCurrentDoc(urlParams.get("document"));
    }
  };

  setCurrentDoc = (name) => {
    var rightDoc = null;
    this.state.documents.forEach((doc) => {
      if (doc.name == name) {
        rightDoc = doc;
      }
    });

    this.setState({
      currentDoc: rightDoc,
    });
  };

  promptEdit = (section) => {
    if (this.state.currentSection > -1) this.setTranslation();
    this.setState({ currentSection: section });
  };

  //changes the translation of "currentSection" to that of "translation" (both in state)
  setTranslation = () => {
    // var docs = this.state.documents;
    // docs[section].translation = translation;

    var thisDoc = this.state.currentDoc;
    thisDoc.body[
      this.state.currentSection
    ].translation = this.state.translation.replace(
      /\n/g,
      this.context.linebreakCode
    );

    this.setState({ currentSection: -1, currentDoc: thisDoc });
    this.saveAll();
  };

  breakOffText = (text, section) => {
    // if (this.state.currentDoc.body[section].text.indexOf(text) > -1) {
    const sectionObj = this.state.currentDoc.body[section];
    const textWithLB = sectionObj.text;
    var textNoLB = "";

    //Step 1: split doc by linebreak, into an array.
    var linebrakeDivides = textWithLB.split(this.context.linebreakCode);

    //Step 2: make an array of linebreak indices, and fill out a No-linebreak-text (textNoLB)
    var linebreakIndices = []; //indices with a linebreak BEFORE
    var indexCount = 0;

    linebrakeDivides.forEach((a) => {
      indexCount += a.length + 1; //because of the space
      textNoLB += a + " ";
      linebreakIndices.push(indexCount);
    });
    linebreakIndices.sort();

    //Step 3: find start and end index in the no linebreak text
    var startingIndex = textNoLB.indexOf(text);
    var endingIndex = startingIndex + text.length;

    //Step 4: then modify these start and end indices based on how many linebreaks come before it.
    var countBeforeStart = 0; //# of linebreaks before starting index
    var countBeforeEnd = 0; //and before ending index
    linebreakIndices.forEach((i) => {
      //use less than or equal to because the linebreak indices are where a linebreak comes BEFORE THAT INDEX
      if (i <= startingIndex) countBeforeStart++;
      if (i <= endingIndex) countBeforeEnd++;
    });

    const linebreakCodeLength = this.context.linebreakCode.length - 1; //IMPORTANT: Minus one because in the text, a linebreak is represented by a space " " character, so it only adds more characters if the sequence is more than 1 character long.

    startingIndex += countBeforeStart * linebreakCodeLength;
    endingIndex += countBeforeEnd * linebreakCodeLength;

    //Step 5: Proceed by splitting the section up, now that you have the starting and ending indices, taking linebreak escape sequences into account.
    var newArr = [
      {
        text: textWithLB.substring(0, startingIndex),
        translation: this.context.defaultText,
      },
      {
        text: textWithLB.substring(startingIndex, endingIndex),
        translation: this.context.defaultText,
      },
      {
        text: textWithLB.substring(endingIndex),
        translation: this.context.defaultText,
      },
    ];

    //Step 6: Handling "Degenerate" sections (aka. if it is just a space or two) Instead of deleting entire sections if they are just a space, merge them into another section

    //Case 1: the middle section is degenerate (merge into last)
    if (this.isDegenerate(newArr[1].text)) {
      var holdText = newArr[1].text;
      newArr[newArr.length - 1].text =
        holdText + newArr[newArr.length - 1].text;
      newArr.splice(1, 1);
    }

    //Case 2: the first section is degenerate (merge into second)
    if (this.isDegenerate(newArr[0].text)) {
      var holdText = newArr[0].text;
      newArr[1].text = holdText + newArr[1].text;
      newArr.splice(0, 1);
    }

    //Case 3: the last section is degenerate AND there is still a section to merge into
    if (
      this.isDegenerate(newArr[newArr.length - 1].text) &&
      newArr.length >= 2
    ) {
      var holdText = newArr[newArr.length - 1].text;
      newArr[newArr.length - 2].text =
        holdText + newArr[newArr.length - 2].text;
      newArr.pop();
    }

    // newArr = newArr.filter((e) => {
    //   if (e.text.length < 2) return false;
    //   var newEl = e.text;
    //   newEl
    //     .replaceAll("\t", "")
    //     .replaceAll(" ", "")
    //     .replaceAll("")
    //     .replaceAll(/(\r\n|\n|\r)/gm, "")
    //     .replaceAll(/[\s\u00A0]/gm, "");
    //   if (newEl.length < 2) return false;
    //   return true;
    // });

    //Step 7: add original translation to FIRST section.
    newArr[0].translation = sectionObj.translation;
    var newDoc = this.state.currentDoc;

    //Step 8: put this new array into the doc, and save everything
    //the splice method modifies by reference, important. Do NOT try newDoc.body = newDoc.body.splice(...);
    newDoc.body.splice(section, 1, ...newArr);

    this.setState({ currentDoc: newDoc });
    clearSelection();
    this.saveAll();
    //}
  };

  isDegenerate = (str) => {
    if (str.length < 1) return true;
    for (var i = 0; i < str.length; i++) {
      if (str.substring(i, i + 1) !== " ") return false;
    }
    return true;
  };

  addSection = (insertAt, text) => {
    if (this.state.currentDoc) {
      text = text.replaceAll("\n", " ");
      var newDoc = this.state.currentDoc;
      newDoc.body.splice(insertAt, 0, {
        text: text,
        translation: this.context.defaultText,
      });
      this.setState({ currentDoc: newDoc });
      this.saveAll();
    }
  };

  deleteSection = (section) => {
    if (this.state.currentDoc) {
      var newDoc = this.state.currentDoc;
      newDoc.body.splice(section, 1);

      this.setState({ currentDoc: newDoc });
      this.saveAll();
    }
  };

  mergeUp = (section) => {
    if (section < 1 || section >= this.state.currentDoc.body.length) {
      return;
    }
    var thisSection = this.state.currentDoc.body[section];
    var prevSection = this.state.currentDoc.body[section - 1];
    var mergedSection = {
      text: prevSection.text + "" + thisSection.text,
      translation: prevSection.translation + " " + thisSection.translation,
    };
    var newDoc = this.state.currentDoc;
    newDoc.body.splice(section - 1, 2, mergedSection);
    this.setState({ currentDoc: newDoc });
    this.saveAll();
  };

  mergeDown = (section) => {
    if (section < 0 || section >= this.state.currentDoc.body.length - 1) {
      return;
    }
    var thisSection = this.state.currentDoc.body[section];
    var nextSection = this.state.currentDoc.body[section + 1];
    var mergedSection = {
      text: thisSection.text + "" + nextSection.text,
      translation: thisSection.translation + " " + nextSection.translation,
    };
    var newDoc = this.state.currentDoc;
    newDoc.body.splice(section, 2, mergedSection);
    this.setState({ currentDoc: newDoc });
    this.saveAll();
  };

  saveAll = async () => {
    this.setState({ loading: true });
    var thisDoc = this.state.currentDoc;
    thisDoc.timestamp = fbFieldValue.serverTimestamp();
    var docid = this.state.currentDoc.uid;

    if (pAuth.currentUser) {
      await pFirestore
        .collection("users")
        .doc(pAuth.currentUser.uid)
        .collection("documents")
        .doc(docid)
        .update(thisDoc);
    }
    this.setState({ loading: false, isSaved: true });
  };

  /**These three functions to save doc settings, add a new doc, and delete a doc. are just copy and pasted from the dashbaord, and do the exact same thing. */
  saveDocSettings = (name, newName, newColor) => {
    //get the right doc based on name,
    var rightDoc = {};
    this.state.documents.forEach((doc) => {
      if (doc.name == name) {
        rightDoc = doc;
      }
    });
    //Make sure name is unique, otherwise just use the original name.
    // var isUnique = true;
    this.state.documents.forEach((doc) => {
      if (doc.name == newName) {
        newName = name;
        // var d = new Date();
        // var uniqueName = newName + " " + d.getTime();
        // isUnique = false;
        // this.saveDocSettings(name, uniqueName, newColor);
      }
    });
    // if (!isUnique) return;

    //then set the new properties
    rightDoc.name = newName;
    rightDoc.color = newColor;
    rightDoc.timestamp = fbFieldValue.serverTimestamp();

    var docid = rightDoc.uid;
    if (pAuth.currentUser) {
      pFirestore
        .collection("users")
        .doc(pAuth.currentUser.uid)
        .collection("documents")
        .doc(docid)
        .update(rightDoc);
    }
  };

  addDoc = (name, color, text) => {
    pFirestore
      .collection("users")
      .doc(pAuth.currentUser.uid)
      .collection("documents")
      .add({
        name: name,
        color: color,
        body: [{ text: text, translation: this.context.defaultText }],
        timestamp: fbFieldValue.serverTimestamp(),
      })
      .then(() => {
        this.openInStudio(name);
      });
  };

  deleteDoc = (name) => {
    //get the right doc based on name,
    var rightDoc = {};
    this.state.documents.forEach((doc) => {
      if (doc.name == name) {
        rightDoc = doc;
      }
    });
    //then do the delete. Note: don't worry about the uid not being there, although it is not created in addDoc(), it will be added in this.state.documents in componentDidMount().
    if (pAuth.currentUser) {
      pFirestore
        .collection("users")
        .doc(pAuth.currentUser.uid)
        .collection("documents")
        .doc(rightDoc.uid)
        .delete()
        .then(() => {
          console.log("Deleted");
        })
        .catch((e) => console.error("error deleting", e));
    }
  };

  openInStudio = (name) => {
    this.setCurrentDoc(name);
  };

  copyTranslation = () => {
    if (this.state.currentDoc && this.state.currentDoc.body) {
      var finalTranslation = "";
      this.state.currentDoc.body.forEach((e) => {
        finalTranslation += e.translation + " ";
      });
      navigator.clipboard.writeText(finalTranslation).then(
        () => {
          alert("Successfully Copied Translation to Clipboard");
        },
        () => {
          alert("Error Copying Translation");
        }
      );
    }
  };

  render() {
    if (this.state.redirect) return <Redirect to={this.state.redirect} />;
    var currentDocBody = this.state.currentDoc
      ? this.state.currentDoc.body
      : [];
    return this.state.currentDoc ? (
      <div id="studio">
        <Beforeunload
          onBeforeunload={(event) => {
            if (!this.state.isSaved) event.preventDefault();
          }}
        />
        <h1 id="studio-h1">
          <i
            className="fas fa-file-alt doc-icon"
            style={{
              color: this.state.currentDoc.color || "var(--pc)",
            }}
          ></i>
          {this.state.currentDoc.name}
        </h1>

        {this.state.loading ? (
          <div className="grayed-out-background">
            <div id="saving-loader">
              <Loading />
              <div>Saving Changes</div>
            </div>
          </div>
        ) : (
          ""
        )}
        <StudioHeader
          backToDocsFunction={() => this.setState({ currentDoc: null })}
          document={this.state.currentDoc || {}}
          breakOffFunction={this.breakOffText}
          copyTranslation={this.copyTranslation}
        />

        <div id="studio-container">
          <div id="studio-grid">
            <LeftStudio
              queryArray={
                this.state.currentDoc ? this.state.currentDoc.body : []
              }
              promptEdit={this.promptEdit}
              mergeUp={this.mergeUp}
              mergeDown={this.mergeDown}
              deleteSection={this.deleteSection}
              addSection={this.addSection}
            />
            <RightStudio
              translations={currentDocBody}
              currentSection={this.state.currentSection}
            />
          </div>

          {this.state.currentSection > -1 ? (
            <div id="translation-container">
              <EditTranslation
                startingY={y - 50}
                section={this.state.currentSection}
                setTranslation={this.setTranslation}
                cancelEdit={() => this.setState({ currentSection: -1 })}
                changeTranslation={(t) => {
                  this.setState({ translation: t, isSaved: false });
                }}
                translation={this.state.translation}
                originalTranslation={
                  this.state.currentDoc.body[this.state.currentSection]
                    ? this.state.currentDoc.body[this.state.currentSection]
                        .translation
                    : ""
                }
              />
            </div>
          ) : (
            ""
          )}
        </div>
      </div>
    ) : (
      <StudioDefault />
    );
  }
}
Studio.contextType = LangContext;

export default Studio;

/**<h1
          id="studio-h1"
          style={
            !this.state.currentDoc
              ? {
                  backgroundColor: "var(--scd)",
                  fontSize: "50px",
                  boxShadow: "0px 3px 5px #121212",
                }
              : {}
          }
        >
          {this.state.currentDoc && (
            <i
              className="fas fa-file-alt doc-icon"
              style={{
                color: this.state.currentDoc.color || "var(--pc)",
              }}
            ></i>
          )}
          {this.state.currentDoc ? this.state.currentDoc.name : "Studio"}
          {!this.state.currentDoc && (
            <div>
              <p>
                All of Translationeer's powerful learning tools in one place
              </p>
              <Link to="/docs" className="studio-manual-link arrow-button">
                Learn how to use Translationeer Studio<span>{">>>"}</span>
              </Link>
            </div>
          )}
        </h1> 
        
        
        ) : (
            <div>
              <h3 className="choose-doc">
                Choose a Document to Open in Translationeer Studio:{" "}
              </h3>
              <DocumentsList
                documents={this.state.documents}
                addDoc={this.addDoc}
                saveDocSettings={this.saveDocSettings}
                openInStudio={this.openInStudio}
                deleteDoc={this.deleteDoc}
              />
            </div>
          )}
        
        */

/**<ul>
              {this.state.documents.map((e) => (
                <li>
                  <button
                    type="button"
                    onClick={this.setCurrentDoc}
                    name={e.name}
                  >
                    {e.name}
                  </button>
                </li>
              ))}
            </ul>


            {this.state.currentSection > -1 && (
          <h2>Section{this.state.currentSection + 1}</h2>
        )}
            
            */
