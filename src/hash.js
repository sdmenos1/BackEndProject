import bcrypt from "bcryptjs";

const plainPassword = "admin123";

bcrypt.hash(plainPassword, 12).then((hash) => {
    console.log("Contraseña hasheada:", hash);
});
