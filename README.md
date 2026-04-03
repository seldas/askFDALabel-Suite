# askFDALabel-Suite

Welcome to askFDALabel-Suite, a comprehensive application designed to assist in the analysis and management of FDA-related label information. This suite provides a user-friendly interface to search, compare, and organize drug label data, and streamlines your workflow by offering efficient tools for regulatory intelligence.

## Getting Started

Follow these instructions to set up and run the askFDALabel-Suite on your local machine using Docker Compose.

### Prerequisites

Before you begin, ensure you have the following installed:

*   **Docker:** [Installation Guide](https://docs.docker.com/get-docker/)
*   **Docker Compose:** (Usually included with Docker Desktop. Verify with `docker compose version`)

### Installation

1.  **Clone the repository:**
    ```bash
    git clone https://github.com/your-repo/askFDALabel-Suite.git
    cd askFDALabel-Suite
    ```

2.  **Configure Environment Variables:**
    The application uses environment variables for configuration. Create a `.env` file in the root directory of the project. A basic `.env` might look like this (you may need to add more variables based on your specific setup, refer to project documentation if available):
    ```env
    # Example .env file
    # Ensure these match values in docker-compose.yml if customized
    POSTGRES_DB=askfdalabel
    POSTGRES_USER=afd_user
    POSTGRES_PASSWORD=afd_password

    # Backend
    BACKEND_PORT=8842
    # Ensure BACKEND_URL in frontend points to this
    BACKEND_URL=http://backend:8842

    # Frontend
    FRONTEND_PORT=8841
    FRONTEND_BASE_PATH=/askfdalabel
    ```

3.  **Build and Run with Docker Compose:**
    Navigate to the root directory of the cloned repository and run:
    ```bash
    docker compose up --build -d
    ```
    This command will:
    *   Build the Docker images for the backend and frontend services.
    *   Start the database, backend, and frontend containers in detached mode (`-d`).

4.  **Verify Services (Optional):**
    You can check the status of your running containers with:
    ```bash
    docker compose ps
    ```

### Accessing the Application

Once all services are up and running, you can access the application:

*   **Frontend:** Open your web browser and navigate to `http://localhost:8841/askfdalabel`.

## Key Features

- **Emerging AE Analysis**: Compare FAERS reports from the last 5 years against the previous 5 years to identify "NEW" safety signals.
- **AI Semantic Matcher**: Use Large Language Models to determine if undocumented FAERS terms are semantically mentioned in the drug labeling (e.g., via synonyms or clinical context).
- **Labeling Scan**: Automatically verify if emerging adverse events are already documented in the official SPL sections.
- **MedDRA Enrichment**: Integrated MedDRA hierarchy (SOC/HLT) for all adverse event reporting.
- **Persistent Cache**: All analysis results are saved in the project database for instant retrieval.

### Stopping the Application

To stop all running services and remove the containers:

```bash
docker compose down
```

To stop and remove containers along with associated volumes (e.g., database data):

```bash
docker compose down -v
```
