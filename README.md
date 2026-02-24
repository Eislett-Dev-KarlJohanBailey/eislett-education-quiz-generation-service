# eislett-education-quiz-generation-service

Quiz generation service: request a quiz (queued via SQS), a worker generates it with OpenAI, and clients poll by id until completed. Quizzes are stored in DynamoDB and scoped per user.

## Architecture

- **API Lambda** (API Gateway): `POST /quiz-generation` (create + queue), `GET /quiz-generation` (list for user with pagination), `GET /quiz-generation/:id` (fetch by id for the authenticated user).
- **Worker Lambda** (SQS): Consumes quiz jobs, sets status to `processing`, generates questions via OpenAI, then sets status to `completed` and stores questions in DynamoDB.
- **DynamoDB**: One table for quiz requests. Each item is keyed by `USER#<userId>` and `QUIZ#<quizId>`, with fields: `instruction`, `subtopics`, `difficultyLevel`, `numberOfQuestions`, `status` (`queued` | `processing` | `completed`), and when completed `questions` (array of question objects).
- **SQS**: Queue for quiz generation jobs. Payload: `{ "id": "<quizId>", "userId": "<userId>" }`.

Quiz ids are generated at request time (e.g. `quiz-<timestamp>-<random>`) so clients can poll `GET /quiz-generation/:id` immediately after `POST`.

**Entitlement and usage:** Before accepting a request, the API checks the user’s **quiz_generation** entitlement in the shared entitlements table (same as access-service): user must have an active entitlement with usage tracking and at least 1 remaining (used &lt; limit). If not, the API returns **402 Payment Required**. When a generation **starts**, the worker sends a **consume 1** message to the **usage-event** SQS queue (so 1 is deducted from the user’s usage). If generation **fails**, the worker sends a **reimburse** message (amount -1) to the same queue so the usage is restored.

## API Endpoints

Base URL is your API Gateway base (e.g. `https://<api-id>.execute-api.<region>.amazonaws.com/<stage>`). Paths below are relative to the API root (if you use a stage like `v1`, the path may be `/v1/quiz-generation`).

### POST /quiz-generation

Creates a quiz generation request, stores it in DynamoDB with status `queued`, sends a job to SQS, and returns the quiz id and status.

**Authentication:** Required. `Authorization: Bearer <JWT>`.

**Request body (JSON):**

| Field              | Type     | Required | Description                                      |
|--------------------|----------|----------|--------------------------------------------------|
| `instruction`      | string   | Yes      | Free-form instruction for the quiz (e.g. topic). |
| `subtopics`        | string[] | No       | List of subtopics. Default: `[]`.                |
| `difficultyLevel`  | number   | Yes      | Difficulty 0–1 (0 = easiest, 1 = hardest).       |
| `numberOfQuestions`| number   | No       | Number of questions to generate (1–50). Default: 5. |

**Example:**

```json
{
  "instruction": "Algebra linear equations",
  "subtopics": ["solving for x", "word problems"],
  "difficultyLevel": 0.5,
  "numberOfQuestions": 10
}
```

**Response:** `201 Created`

```json
{
  "id": "quiz-1739123456789-abc12def",
  "status": "queued"
}
```

**Errors:**

- `400` – Validation (e.g. missing `instruction`, `difficultyLevel` not in 0–1).
- `401` – Missing or invalid JWT.
- `402` – **Payment Required**: User has no access to `quiz_generation` or no remaining usage (limit reached). Check entitlements and usage in the database.

---

### GET /quiz-generation

Returns paginated quiz generation requests for the authenticated user (newest first). Same response shape as the rest of the system: `amount`, `data`, `pagination` with `page_size`, `page_number`, `total_pages`.

**Authentication:** Required. `Authorization: Bearer <JWT>`.

**Query parameters:**

| Name          | Type   | Default | Description                    |
|---------------|--------|---------|--------------------------------|
| `page_number` | number | 1       | 1-based page index.            |
| `page_size`   | number | 20      | Number of items per page.      |

**Response:** `200 OK`

```json
{
  "amount": 42,
  "data": [
    {
      "id": "quiz-1739123456789-abc12def",
      "userId": "user-123",
      "instruction": "Algebra linear equations",
      "subtopics": ["solving for x"],
      "difficultyLevel": 0.5,
      "numberOfQuestions": 10,
      "status": "completed",
      "questions": [ "... optional, when completed ..." ],
      "createdAt": "2024-01-15T10:29:00.000Z",
      "updatedAt": "2024-01-15T10:30:00.000Z"
    }
  ],
  "pagination": {
    "page_size": 20,
    "page_number": 1,
    "total_pages": 3
  }
}
```

**Errors:**

- `401` – Missing or invalid JWT.

---

### GET /quiz-generation/:id

Returns the quiz request for the given `id` for the authenticated user. Use this to poll until `status` is `completed` and then read `questions`.

**Authentication:** Required. `Authorization: Bearer <JWT>`.

**Path parameters:**

| Name | Type   | Description        |
|------|--------|--------------------|
| `id` | string | Quiz request id from POST. |

**Response:** `200 OK`

```json
{
  "id": "quiz-1739123456789-abc12def",
  "userId": "user-123",
  "instruction": "Algebra linear equations",
  "subtopics": ["solving for x", "word problems"],
  "difficultyLevel": 0.5,
  "numberOfQuestions": 10,
  "status": "completed",
  "questions": [
    {
      "id": "q1",
      "createdAt": "2024-01-15T10:30:00.000Z",
      "title": "Solve for x",
      "content": "What is x in 2x + 3 = 11?",
      "tags": ["algebra", "linear-equations"],
      "totalPotentialMarks": 5,
      "difficultyLevel": 5,
      "subTopics": ["solving for x"],
      "type": "multiple_choice",
      "options": [
        { "content": "x = 4", "isCorrect": true, "explanation": "2(4)+3=11" },
        { "content": "x = 5", "isCorrect": false }
      ],
      "explanation": "Subtract 3 then divide by 2.",
      "madeById": "user-123",
      "userType": "student"
    }
  ],
  "createdAt": "2024-01-15T10:29:00.000Z",
  "updatedAt": "2024-01-15T10:30:00.000Z"
}
```

When still processing, `status` is `queued` or `processing` and `questions` may be absent.

**Errors:**

- `401` – Missing or invalid JWT.
- `404` – No quiz request for this user with that `id`.

---

## Question object shape

Each item in `questions` follows the same schema as `question.entity.ts` (Eislett learner API):

- **Entity:** `id?`, `createdAt`
- **Required:** `title`, `content`, `tags`, `totalPotentialMarks`, `difficultyLevel`
- **Optional:** `description`, `subTopics`, `explanation`, `mediaUrl`, `mediaAlt`, `hidden`, `vectorStoreFileId`, `vectorStoreProvider`, `type`, `options`, `isTrue`, `shortAnswers`, `madeById`, `userType`

`options` (multiple_choice), `isTrue` (true_or_false), and `shortAnswers` (short_answer) are used depending on `type`.

---

## CI (GitHub Actions)

A workflow in `.github/workflows/ci.yml` runs on push/PR to `main`, `development`, and `dev`:

- **Build job:** Installs dependencies, builds and packages both `quiz-generation-api` and `quiz-generation-worker` (produces `function.zip` for each).
- **Deploy job:** Runs only on push (not PR). Bootstraps the Terraform backend (S3 + DynamoDB lock table for `quiz-generation-service`), then runs `terraform apply` for `infra/services/quiz-generation-service`.

**Required GitHub secrets** (repo or environment):

| Secret | Purpose |
|--------|--------|
| `AWS_ACCESS_KEY_ID` | AWS credentials for Terraform and backend bootstrap |
| `AWS_SECRET_ACCESS_KEY` | AWS credentials |
| `TF_STATE_BUCKET_NAME` | Foundation/state S3 bucket name |
| `TF_STATE_REGION` | State bucket region (e.g. `us-east-1`) |
| `TF_STATE_BUCKET_KEY` | S3 key for foundation state file |
| `ACCESS_SERVICE_STATE_KEY` | S3 key for access-service state (entitlements table) |
| `USAGE_EVENT_QUEUE_URL` | Usage-event SQS queue URL |

**Optional:** `ACCESS_SERVICE_STATE_BUCKET`, `ACCESS_SERVICE_STATE_REGION` — if the access-service state lives in a different bucket/region.

**Optional variable:** `vars.PROJECT_NAME` (default `eislett-education`).

---

## Infra (Terraform)

- **Location:** `infra/services/quiz-generation-service/`
- **Assumes:** Remote state for foundation (API Gateway id, root id) and for **access-service** (entitlements table name/ARN). You provide the usage-event queue **URL** directly via `usage_event_queue_url`. Secrets: `openai-api-key`, `jwt-access-token-secret` (same naming as conversation service).
- **Variables:** Required: `state_bucket_name`, `state_region`, `state_bucket_key`, `access_service_state_key` (S3 key of access-service state), `usage_event_queue_url`. Optional: `access_service_state_bucket` and `access_service_state_region` — if set, access-service state is read from this bucket/region; if empty, `state_bucket_name` and `state_region` are used.
- **Resources:** DynamoDB table, SQS queue, API Lambda (with API Gateway link for path `quiz-generation`), Worker Lambda (SQS event source mapping), IAM roles and policies.

Apply from the service directory:

```bash
cd infra/services/quiz-generation-service
terraform init -backend-config=...
terraform plan
terraform apply
```

Build and package Lambdas before apply:

```bash
cd services/quiz-generation-api && npm ci && npm run package
cd ../quiz-generation-worker && npm ci && npm run package
```

---

## Services

| Service                 | Role                          |
|-------------------------|-------------------------------|
| `services/quiz-generation-api`   | HTTP API (POST quiz-generation, GET list + GET by id). |
| `services/quiz-generation-worker`| SQS consumer, OpenAI quiz generation, DynamoDB update. |

Both Lambdas are defined in `infra/services/quiz-generation-service/main.tf` and use the same DynamoDB table and (for the worker) the same SQS queue.
