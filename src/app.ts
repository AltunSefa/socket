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
interface Room {
  user1: string;
  user2: string;
  connectionId: string;
}

const rooms: Map<string, Room> = new Map();

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
        unSeen: (notification.documents[0] as any)?.unSeen,
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
            unSeen: false,
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
            unSeen: false,
          }
        );
      }
    }
  });

  socket.on("joinRoom", async (keys) => {
    console.log("joinRoom", keys);
    const { connectionId, userID } = keys;

    let room: Room | undefined;
    // Verilen connectionId'ye ait bir oda var mı kontrol edelim
    const speacialRoom = rooms.get(connectionId);
    if (!speacialRoom) {
      // Oda yoksa, yeni bir oda oluştur
      rooms.set(connectionId, { user1: userID, user2: "", connectionId });

      console.log("oda oluştu");
    } else if (speacialRoom.user2 === "") {
      // Oda varsa, ikinci kullanıcıyı ekleyin
      speacialRoom.user2 = userID;
      rooms.set(connectionId, speacialRoom);
      console.log("ikinci user geldi");
    } else if (speacialRoom.user1 === "") {
      // Oda varsa, ikinci kullanıcıyı ekleyin
      speacialRoom.user1 = userID;
      rooms.set(connectionId, speacialRoom);
      console.log("birinci user geldi");
    }
  });

  socket.on("removeRoom", async (keys) => {
    const { connectionId, userID } = keys;
    const room = rooms.get(connectionId);
    if (room) {
      if (userID === room.user1) {
        room.user1 = "";
        console.log("user1 çıktı");
      } else if (userID === room.user2) {
        room.user2 = "";
        console.log("user2 çıktı");
      }
      // Eğer her iki kullanıcı da odadan ayrıldıysa, odayı sil
      if (room.user1 === "" && room.user2 === "") {
        rooms.delete(connectionId);
        console.log("room silindi");
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
      senderName,
      profileImageUrl,
    } = message;

    const room = rooms.get(conversationId);

    // check receiver on rooms

    if (receiverId === room?.user1 || receiverId === room?.user2) {
      console.log("receiverId", receiverId);
      console.log("room?.user1", room?.user1);
      console.log("room?.user2", room?.user2);
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
            unSeen: true,
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
          unSeen: true,
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
      }
    } else {
      console.log("receiverId", receiverId);
      console.log("room?.user1", room?.user1);
      console.log("room?.user2", room?.user2);
      if (control === false) {
        const getConversation = await database.listDocuments(
          "66397753002754b32828",
          "6658b0d90035989e7b16",
          [Query.equal("participants", conversationId)]
        );

        await database.updateDocument(
          "66397753002754b32828",
          "6658b0d90035989e7b16",
          getConversation.documents[0].$id,
          {
            lastMessage: text,
            lastMessageId: senderId,
            unSeen: false,
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
          unSeen: false,
          active,
          profileImageUrl,
          senderName,
        });
        socket.emit("receiveMessage", {
          senderId,
          conversationId,
          receiverId,
          text,
          unSeen: false,
          active,
          profileImageUrl,
          senderName,
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
      } else {
        socket.emit("receiveMessage", {
          senderId,
          conversationId,
          receiverId,
          text,
          unSeen: false,
          profileImageUrl,
          senderName,
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
    }
  });

  socket.on("disconnect", () => {
    console.log("Bir kullanıcı ayrıldı");
    const deletedUserId = Array.from(users).find(
      ([key, value]) => value === socket.id
    )?.[0];
    users.delete(deletedUserId!);
  });
});

server.listen(PORT, () => {
  console.log(`Server ${PORT} portunda çalışıyor`);
});
