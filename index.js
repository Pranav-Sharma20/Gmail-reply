const express = require("express");
const { google } = require("googleapis");
const { OAuth2 } = google.auth;
const nodemailer = require("nodemailer");
require("dotenv").config();

const app = express();

// Authentication 
const oAuth2Client = new OAuth2(
  process.env.CLIENT_ID,
  process.env.CLIENT_SECRET,
  process.env.REDIRECT_URI
);

// Refreshing the Credentials 
oAuth2Client.setCredentials({
  refresh_token: process.env.REFRESH_TOKEN,
});

const gmail = google.gmail({
  version: "v1",
  auth: oAuth2Client
});

const checkForNewMessages = () => {
  // Get the details of message 
  gmail.users.messages.list({
      userId: "me",
      q: `is:unread`,
    },
    async (err, res) => {
      if (err) return console.log("Error: " + err);

      const messages = res.data.messages;

      if (messages?.length) {
        console.log("Received New message!");

        //Checking for the messages that are unread
        for (const message of messages) {
          const messageDetails = await gmail.users.messages.get({
            userId: "me",
            id: message.id,
          });
          const Id_thread = messageDetails.data.Id_thread;
          const threadDetails = await gmail.users.threads.get({
            userId: "me",
            id: Id_thread,
          });

          if (
            !threadDetails.data.messages.some(
              (msg) =>
              msg.labelIds.includes("SENT") &&
              msg.payload.headers.find(
                (header) =>
                header.name === "From" &&
                header.value.includes("ps25372@gmail.com")
              )
            )
          ) {
            console.log(
              `New email thread with subject "${
                messageDetails.data.payload.headers.find(
                  (header) => header.name === "Subject"
                ).value
              }" and thread ID ${Id_thread} received!`
            );

            // Sending a responses to the unread message
            const transporter = nodemailer.createTransport({
              service: "gmail",
              auth: {
                type: "OAuth2",
                user: "ps25372@gmail.com",
                clientId: process.env.CLIENT_ID,
                clientSecret: process.env.CLIENT_SECRET,
                refreshToken: process.env.REFRESH_TOKEN,
                accessToken: oAuth2Client.getAccessToken(),
              },
            });

            const mailOptions = {
              from: "ps25372@gmail.com",
              to: messageDetails.data.payload.headers.find(
                (header) => header.name === "From"
              ).value,
              subject: "Re: " +
                messageDetails.data.payload.headers.find(
                  (header) => header.name === "Subject"
                ).value,
              text: "Thanks! I will respond ASAP",
            };

            transporter.sendMail(mailOptions, async (err, info) => {
              if (err) {
                console.log(err);
              } else {
                console.log(
                  `Automatic response sent to ${
                    messageDetails.data.payload.headers.find(
                      (header) => header.name === "From"
                    ).value
                  }: ${info.response}`
                );
               

                const labelName = "Replied";

                // Check if label exists
                let label = null;
                let labels = [];
                let labelFound = false
                gmail.users.labels
                  .list({
                    userId: "me",
                  })
                  .then((res) => {
                    console.log("LABELS FETCHED");
                    labels = res.data.labels;
                    labels.forEach((l) => {
                      if (l.name === labelName){
                        console.log(`"${labelName}" label already exists`);
                        label=l;
                        labelFound = true;
                      }
                    });
                    if (!labelFound) {
                      gmail.users.labels.create({
                        userId: "me",
                        requestBody: {
                          name: labelName,
                          labelListVisibility: "labelShow",
                          messageListVisibility: "show",
                        },
                      }).then(res => {
                        console.log(`"${labelName}" label created`, res);
                        gmail.users.threads.modify({
                            userId: "me",
                            id: Id_thread,
                            resource: {
                              addLabelIds: [label.id],
                            },
                          })
                          .then((res) => {
                            console.log(`"Replied" label added`, res);
                          })
                          .catch((err) => {
                            console.log("couldn't add label", err);
                          });
                      }).catch(err => {
                        console.log("CREATING LABEL ERROR", err);
                      })
                    } else {
                      gmail.users.threads.modify({
                          userId: "me",
                          id: Id_thread,
                          resource: {
                            addLabelIds: [label.id],
                          },
                        })
                        .then((res) => {
                          console.log(`"Replied" label added`, res);
                        })
                        .catch((err) => {
                          console.log("couldn't add label", err);
                        });
                    }
                  })
                  .catch((err) => {
                    console.log("ERROR WITH LABELS", err);
                  });
              }
            });

          } else {
            console.log(
              `Email thread with thread ID ${Id_thread} already has a reply from you.`
            );
          }
        }
      } else {
        console.log("No new messages.");
      }
    }
  );
};

//Used to automatically refresh
setInterval(checkForNewMessages, 10000);

app.get("/", async (req, res) => {
  res.send("Gmail Replier");
});

app.listen(process.env.PORT, () => {
  console.log("listening on port " + process.env.PORT);
});