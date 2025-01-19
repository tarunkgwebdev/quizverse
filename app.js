import express from "express";
import pg from "pg";
import bodyParser from "body-parser";
import session from "express-session";
import bcrypt from "bcrypt";
import env from "dotenv";

const port = 3000;
const app = express();
const saltRounds = 3;
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static("public"));
app.set("view engine", "ejs");
env.config();

const db = new pg.Client({
    user: process.env.DB_USER,
    host: process.env.DB_HOST,
    database: process.env.DB_DATABASE,
    password: process.env.DB_PASSWORD,
    port: process.env.DB_PORT,
  });
db.connect();

app.use(session({
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: true,
}));

app.get("/", (req,res) => {
    res.render("login.ejs");
});

app.post("/", (req,res) => {
    console.log(req.body);
    const {userEmail,userEmailPass} = req.body;
    db.query(
        "SELECT * FROM admins WHERE admin_gmail = $1 AND admin_password = $2;",
        [userEmail, userEmailPass],
        (err, adminResult) => {
            if (err) {
                console.error("Error while checking admin data: ", err.stack);
                res.status(500).send("Internal Server Error.");
            } else if (adminResult.rows.length > 0) {
                console.log("Admin Login Successful");
                res.render("admin_dashboard.ejs", {
                    adminName: adminResult.rows[0].admin_name,
                    adminId: adminResult.rows[0].admin_id,
                });
            } else {

                db.query(
                    "select * from users where umail = ($1);",
                    [userEmail],
                    (err, result) => {
                        if (err) {
                            console.error("Error while fetching data: ", err.stack);
                            res.status(500).send("Internal Server Error.");
                        } else if(result.rows.length > 0) {
                            const storedPass = result.rows[0].upassword;
                            bcrypt.compare(userEmailPass, storedPass, (err,result1)=>{
                                if(err) {
                                    res.render("login.ejs", { errorMessage: "Email or Password is wrong" });
                                    console.log("Invalid Credentials")
                                } else {
                                    console.log("Login Successful", result1);
                                    res.render("user_dashboard.ejs");
                                }
                            });
                        } 
                    }
                );
            }
        }
    )
});


app.get("/signup", (req, res) => {
    res.render("signup.ejs");
});

app.post("/signup", (req,res) => {
    console.log(req.body);
    const {userEmail,userEmailPass,userName} = req.body;
    
    db.query(
        "select * from users where umail = ($1)",
        [userEmail],
        (err,result) => {
            if (err) {
                console.error("Error while fetching data: ", err);
                res.status(500).send("Internal Server Error.");
            } else if (result.rows.length > 0) {
                res.render("user_dashboard.ejs", { alertMessage : "Account already exists. Logging you in..."});
            } else {
                bcrypt.hash(userEmailPass, saltRounds, (err,hash) => {
                    if (err) {
                        console.log(err.stack);
                    } else{
                        console.log(hash);
                        db.query("insert into users (umail, upassword, uname) values ($1,$2,$3)",
                            [userEmail,hash,userName],
                            (err) => {
                                if (err) {
                                    console.error("Error inserting data: ", err.stack);
                                    res.status(500).send("Error inserting data.");
                                } else {
                                    res.render("user_dashboard.ejs");
                                }
                            }
                        );
                    }
                });
            }
        }
    )
});

app.post("/quiz", (req,res) => {
    const { quizCategory, quizNoq, quizTimer } = req.body;
    console.log("Quiz Settings:", quizCategory, quizNoq, quizTimer);
    db.query(
        "select * from questions where category = ($1) order by random() limit ($2);",
        [quizCategory, parseInt(quizNoq)],
        (err,result) => {
            if (err) {
                console.error("Error while fetching data: ", err);
                res.status(500).send("Internal Server Error.");
            } else {
                const quizQuestions = result.rows;
                console.log("Questions fetched successfully");
                req.session.quizQuestions = quizQuestions;
                res.render("quiz.ejs", {
                    quizQuestions:quizQuestions,
                    quizNoq:quizNoq,
                    quizTimer:quizTimer
                });
            }
        }
    );
});

app.post("/quiz/result", (req, res) => {
    console.log(req.body);
    const answers = req.body; 
    let score = 0;
    const quizQuestions = req.session.quizQuestions;

    if (!quizQuestions) {
        return res.status(400).send("Quiz questions not found.");
    }

    quizQuestions.forEach((question, index) => {
        const userAnswer = parseInt(answers[`answer_${index}`]);
        const correctAnswer = question.correct_option;
        
        if (userAnswer === correctAnswer) {
            score++;
        }
    });
    req.session.quizQuestions = null;

    res.render("result", {
        score: score,
        total: quizQuestions.length
    });
});

app.post("/manage-questions", (req,res) => {
    console.log("Inside manage questions");
    db.query("select * from questions order by category;", (err,result) => {
        if (err) {
            console.log("Error While Fetching Data : ", err.stack);
            res.status(500).send("Internal Server Error.");
        } else {
            console.log(result.rows);
            const manageQuestions = result.rows;
            res.render("manage_questions.ejs", { manageQuestions:manageQuestions });
        }
    });
});


app.get("/manage-questions", (req,res) => {
    console.log("Inside manage questions");
    db.query("select * from questions order by category;", (err,result) => {
        if (err) {
            console.log("Error While Fetching Data : ", err.stack);
            res.status(500).send("Internal Server Error.");
        } else {
            console.log(result.rows);
            const manageQuestions = result.rows;
            res.render("manage_questions.ejs", { manageQuestions:manageQuestions });
        }
    });
});

app.post("/add-question", (req, res) => {
    const { category, question, option1, option2, option3, option4, correctOption } = req.body;

    db.query(
        "INSERT INTO questions (category, question, option1, option2, option3, option4, correct_option) VALUES ($1, $2, $3, $4, $5, $6, $7)",
        [category, question, option1, option2, option3, option4, correctOption],
        (err) => {
            if (err) {
                console.error("Error while adding question:", err.stack);
                res.status(500).send("Error adding question.");
            } else {
                console.log("Question added successfully!");
                db.query("select * from questions order by category;", (err,result) => {
                    if (err) {
                        console.log("Error While Fetching Data : ", err.stack);
                        res.status(500).send("Internal Server Error.");
                    } else {
                        console.log(result.rows);
                        const manageQuestions = result.rows;
                        res.render("manage_questions.ejs",{manageQuestions:manageQuestions, message:"Question added successfully!"});             }
                });
            }
        }
    );
});

app.post("/edit-question", (req, res) => {
    const { id, category, question, option1, option2, option3, option4, correctOption } = req.body;

    db.query(
        "UPDATE questions SET category = $1, question = $2, option1 = $3, option2 = $4, option3 = $5, option4 = $6, correct_option = $7 WHERE id = $8",
        [category, question, option1, option2, option3, option4, correctOption, id],
        (err) => {
            if (err) {
                console.error("Error while editing question:", err.stack);
                res.status(500).send("Error editing question.");
            } else {
                console.log("Question updated successfully!");
                db.query("select * from questions order by category;", (err,result) => {
                    if (err) {
                        console.log("Error While Fetching Data : ", err.stack);
                        res.status(500).send("Internal Server Error.");
                    } else {
                        console.log(result.rows);
                        const manageQuestions = result.rows;
                        res.render("manage_questions.ejs",{manageQuestions:manageQuestions, message:"Question updated successfully!"});             }
                });
            }
        }
    );
});

app.post("/delete-question", (req, res) => {
    const { id } = req.body;

    db.query("DELETE FROM questions WHERE id = $1", [id], (err) => {
        if (err) {
            console.error("Error while deleting question:", err.stack);
            res.status(500).send("Error deleting question.");
        } else {
            console.log("Question deleted successfully!");
            db.query("select * from questions order by category;", (err,result) => {
                if (err) {
                    console.log("Error While Fetching Data : ", err.stack);
                    res.status(500).send("Internal Server Error.");
                } else {
                    console.log(result.rows);
                    const manageQuestions = result.rows;
                    res.render("manage_questions.ejs",{manageQuestions:manageQuestions, message:"Question deleted successfully!"});             }
            });
        }
    });
});

app.post("/redirectit", (req,res) => {
   res.render("user_dashboard.ejs"); 
});

app.listen(port, () => {
    console.log(`Server in running on http://localhost:${port}.`);
});