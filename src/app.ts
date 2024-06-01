import express from "express";
import http from "http";
import { Server as SocketIOServer } from "socket.io";
import { ID, Query } from "node-appwrite";

import { database } from "./db";

const app = express();
const PORT = 3005;

const server = http.createServer(app);
const io = new SocketIOServer(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"],
    credentials: true,
  },
});

const users = new Map<string, string>();

io.on("connection", (socket) => {
  console.log("Bir kullanıcı bağlandı");

  socket.on("addUser", ({ userId }) => {
    users.set(userId, socket.id);
  });

  //send notification
  socket.on("sendNotification", async (data) => {
    console.log("sendNotification", data);
    const {
      senderId,
      receiverId,
      type,
      postId,
      commentId,
      unSeen,
      active,
      senderImageUrl,
      senderName,
    } = data;

    let queryArray = [
      Query.equal("senderId", senderId),
      Query.equal("receiverId", receiverId),
      Query.equal("type", type),
    ];

    if (postId) {
      queryArray.push(Query.equal("postId", postId));
    }
    if (commentId) {
      queryArray.push(Query.equal("commentId", commentId));
    }

    const notification = await database.listDocuments(
      "66397753002754b32828",
      "663bd80a00250402979e",
      queryArray
    );
    const receiverSocketId = users.get(receiverId);
    if (receiverSocketId) {
      console.log(type);
      socket.to(receiverSocketId).emit("receiveNotification", {
        senderId,
        receiverId,
        type,
        postId: postId ? postId : null,
        commentId: commentId ? commentId : null,
        unSeen,
        active,
        senderImageUrl,
        senderName,
      });
      if (notification.documents.length > 0) {
        await database.updateDocument(
          "66397753002754b32828",
          "663bd80a00250402979e",
          notification.documents[0].$id,
          {
            active: true,
          }
        );
      } else {
        await database.createDocument(
          "66397753002754b32828",
          "663bd80a00250402979e",
          ID.unique(),
          {
            senderId,
            receiverId,
            type,
            postId: postId ? postId : null,
            commentId: commentId ? commentId : null,
            unSeen,
            active,
            senderImageUrl,
            senderName,
          }
        );
      }
    } else {
      console.log(type);
      await database.createDocument(
        "66397753002754b32828",
        "663bd80a00250402979e",
        ID.unique(),
        {
          senderId,
          receiverId,
          type,
          postId: postId ? postId : null,
          commentId: commentId ? commentId : null,
          unSeen,
          active,
          senderImageUrl,
          senderName,
        }
      );
    }
  });

  socket.on("removeNotification", async (data) => {
    const { senderId, receiverId, type, postId, commentId, active } = data;
    const receiverSocketId = users.get(receiverId);
    let queryArray = [
      Query.equal("senderId", senderId),
      Query.equal("receiverId", receiverId),
      Query.equal("type", type),
    ];

    if (postId) {
      queryArray.push(Query.equal("postId", postId));
    }
    if (commentId) {
      queryArray.push(Query.equal("commentId", commentId));
    }

    const notification = await database.listDocuments(
      "66397753002754b32828",
      "663bd80a00250402979e",
      queryArray
    );

    console.log("removeNotification", notification);
    if (receiverSocketId) {
      console.log(type);
      socket.to(receiverSocketId).emit("removeReceiveNotification", {
        senderId,
        receiverId,
        type,
        postId,
        commentId,
        active,
      });
      if (notification.documents.length > 0) {
        await database.updateDocument(
          "66397753002754b32828",
          "663bd80a00250402979e",
          notification.documents[0].$id,
          {
            active: false,
          }
        );
      }
    } else {
      console.log(type);
      if (notification.documents.length > 0) {
        await database.updateDocument(
          "66397753002754b32828",
          "663bd80a00250402979e",
          notification.documents[0].$id,
          {
            active: false,
          }
        );
      }
    }
  });
  // send message
  socket.on("sendMessage", async (message) => {
    const {
      senderId,
      receiverId,
      text,
      unSeen,
      active,
      conversationId,
      control,
    } = message;

    console.log("asd", conversationId, control);

    if (control === false) {
      const getConversation = await database.listDocuments(
        "66397753002754b32828",
        "6658b0d90035989e7b16",
        [Query.equal("participants", conversationId)]
      );

      const updateConversation = await database.updateDocument(
        "66397753002754b32828",
        "6658b0d90035989e7b16",
        getConversation.documents[0].$id,
        {
          lastMessage: text,
          lastMessageId: senderId,
        }
      );
    }

    const receiverSocketId = users.get(receiverId);
    if (receiverSocketId) {
      console.log(text);
      socket.to(receiverSocketId).emit("receiveMessage", {
        senderId,
        conversationId,
        receiverId,
        text,
        unSeen,
        active,
      });
      socket.emit("receiveMessage", {
        senderId,
        conversationId,
        receiverId,
        text,
        unSeen: true,
        active,
      });
      await database.createDocument(
        "66397753002754b32828",
        "6639776c003a4977f834",
        ID.unique(),
        {
          senderId,
          conversationId,
          receiverId,
          text,
          unSeen: true,
          active,
        }
      );
    } else {
      socket.emit("receiveMessage", {
        senderId,
        conversationId,
        receiverId,
        text,
        unSeen: false,
        active,
      });
      await database.createDocument(
        "66397753002754b32828",
        "6639776c003a4977f834",
        ID.unique(),
        {
          senderId,
          conversationId,
          receiverId,
          text,
          unSeen: false,
          active,
        }
      );
    }

    socket.on("disconnect", () => {
      console.log("Bir kullanıcı ayrıldı");
      const deletedUserId = Array.from(users).find(
        ([key, value]) => value === socket.id
      )?.[0];
      users.delete(deletedUserId!);
    });
  });
});

server.listen(PORT, () => {
  console.log(`Server ${PORT} portunda çalışıyor`);
});
