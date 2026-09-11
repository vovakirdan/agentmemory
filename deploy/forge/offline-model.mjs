import { env } from "@huggingface/transformers";

env.allowRemoteModels = false;
env.localModelPath = "/opt/agentmemory/models/";
env.useFSCache = false;
