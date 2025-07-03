import bcrypt from "bcryptjs";

const plainPassword = "";

bcrypt.hash(plainPassword, 12).then((hash) => {
    console.log("Contraseña hasheada:", hash);
});
